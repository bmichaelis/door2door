# Token-Based Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make house/business search match every whitespace-separated token in any order (so `2805 apache` finds `2805 N APACHE LN`), and widen the household name branch from surname-only to surname + head-of-household + spouse — without regressing trigram-index usage.

**Architecture:** Keep the existing UNION-of-per-branch, trgm-indexed `ILIKE` searches. Replace each branch's single `ILIKE` with an AND-chain of per-token `ILIKE`s (index-friendly: each is a separate `~~*` op the GIN trgm index serves via BitmapAnd). Add a trgm expression index for the new concatenated name expression and drop the superseded surname-only index.

**Tech Stack:** Next.js edge route handlers, drizzle-orm `sql` tagged templates, Neon Postgres + pg_trgm, vitest.

## Global Constraints

- Preserve the UNION-of-per-branch structure; do NOT merge branches or reintroduce an `OR` + lateral join (that defeated the trgm index and caused 243K lateral executions).
- Token form is an explicit AND-chain — `expr ILIKE $1 AND expr ILIKE $2 …` — NOT `expr ILIKE ALL(ARRAY[...])` (a ScalarArrayOp ALL cannot use the GIN trgm index).
- Each branch's WHERE expression must stay structurally identical to its trgm index expression (same columns, `COALESCE(..., '')` defaults, `' '` separators, order) so the index is used. Table alias is irrelevant (`COALESCE(ho.surname,'')` matches an index on `COALESCE(surname,'')`).
- Hand-written migration convention: a `.sql` file plus a `meta/_journal.json` entry ONLY — no snapshot file (matches 0006–0014).
- The new migration's journal `when` MUST be real current epoch-ms and **strictly greater than idx 14's `1783467229017`** — the #14 guardrail (`lib/db/journal.test.ts`) fails the suite otherwise.
- No new dependencies. `ORDER BY` / `LIMIT 8` unchanged (ranking is out of scope).
- DB verification runs on a disposable Neon branch, never against production.

---

### Task 1: Search helpers (`lib/search.ts` + test)

**Files:**
- Create: `lib/search.ts`
- Test: `lib/search.test.ts`

**Interfaces:**
- Produces:
  - `function tokenPatterns(q: string): string[]` — whitespace-split `%token%` patterns; `[]` for empty/whitespace.
  - `function ilikeAllTokens(expr: SQL, patterns: string[]): SQL` — parenthesized AND-chain of `expr ILIKE <pattern>`.

- [ ] **Step 1: Write the failing test**

Create `lib/search.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sql } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { tokenPatterns, ilikeAllTokens } from './search'

const render = (frag: ReturnType<typeof ilikeAllTokens>) =>
  new PgDialect().sqlToQuery(frag)

describe('tokenPatterns', () => {
  it('wraps each whitespace-split token in %…%', () => {
    expect(tokenPatterns('2805 apache')).toEqual(['%2805%', '%apache%'])
  })
  it('collapses leading/trailing/repeated whitespace', () => {
    expect(tokenPatterns('  1060   450  north ')).toEqual(['%1060%', '%450%', '%north%'])
  })
  it('handles a single token', () => {
    expect(tokenPatterns('michaelis')).toEqual(['%michaelis%'])
  })
  it('returns [] for empty or whitespace-only input', () => {
    expect(tokenPatterns('')).toEqual([])
    expect(tokenPatterns('   ')).toEqual([])
  })
})

describe('ilikeAllTokens', () => {
  it('emits one ILIKE per token, AND-joined and parenthesized', () => {
    const { sql: text, params } = render(ilikeAllTokens(sql`col`, ['%a%', '%b%']))
    expect(params).toEqual(['%a%', '%b%'])
    expect((text.match(/ilike/gi) ?? []).length).toBe(2)
    expect(text.trim().startsWith('(')).toBe(true)
    expect(text.trim().endsWith(')')).toBe(true)
    expect(text.toLowerCase()).toContain(' and ')
  })
  it('handles a single token without an AND', () => {
    const { sql: text, params } = render(ilikeAllTokens(sql`col`, ['%a%']))
    expect(params).toEqual(['%a%'])
    expect((text.match(/ilike/gi) ?? []).length).toBe(1)
    expect(text.toLowerCase()).not.toContain(' and ')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- lib/search.test.ts`
Expected: FAIL — cannot resolve `./search`.

- [ ] **Step 3: Write the implementation**

Create `lib/search.ts`:

```ts
import { sql, type SQL } from 'drizzle-orm'

/** Split a query into `%token%` ILIKE patterns. Empty/whitespace input → []. */
export function tokenPatterns(q: string): string[] {
  return q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => '%' + t + '%')
}

/**
 * Build a parenthesized AND-chain of `expr ILIKE <pattern>` over every pattern.
 * Each ILIKE is a separate op so an expression trgm index can serve it
 * (BitmapAnd). Callers guarantee patterns.length >= 1 (routes reject empty q).
 */
export function ilikeAllTokens(expr: SQL, patterns: string[]): SQL {
  return sql`(${sql.join(
    patterns.map((p) => sql`${expr} ILIKE ${p}`),
    sql` AND `,
  )})`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- lib/search.test.ts`
Expected: PASS (6 tests).

Note: the `ilikeAllTokens` assertions check the bound params (the load-bearing correctness) plus the ILIKE count, AND-join, and parentheses — deliberately not an exact rendered string, so they don't break on drizzle's whitespace/case rendering.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit` (expect clean), then:

```bash
git add lib/search.ts lib/search.test.ts
git commit -m "feat: token-search helpers (tokenPatterns, ilikeAllTokens) (#17)"
```

---

### Task 2: Migration — household name trgm index (`0015_household_name_trgm`)

**Files:**
- Create: `lib/db/migrations/0015_household_name_trgm.sql`
- Modify: `lib/db/migrations/meta/_journal.json` (append one entry)

**Interfaces:**
- Produces: the canonical household-name expression that Task 3's name branch must match verbatim:
  `(COALESCE(surname, '') || ' ' || COALESCE(head_of_household_name, '') || ' ' || COALESCE(spouse_name, ''))`

- [ ] **Step 1: Create the migration SQL**

Create `lib/db/migrations/0015_household_name_trgm.sql`:

```sql
-- Trigram index for token search across the full household name
-- (surname + head-of-household + spouse). Supersedes the surname-only index.
CREATE INDEX IF NOT EXISTS households_name_trgm_idx
  ON households USING GIN ((COALESCE(surname, '') || ' ' || COALESCE(head_of_household_name, '') || ' ' || COALESCE(spouse_name, '')) gin_trgm_ops);

DROP INDEX IF EXISTS households_surname_trgm_idx;
```

- [ ] **Step 2: Compute a strictly-increasing `when`**

Run: `node -e "console.log(Math.max(Date.now(), 1783467229018))"`
This prints an epoch-ms value guaranteed to exceed idx 14's `1783467229017`. Record the printed number as `<WHEN>` for the next step.

- [ ] **Step 3: Append the journal entry**

In `lib/db/migrations/meta/_journal.json`, add a comma after the idx-14 entry's closing brace and append this entry as the last element of the `entries` array (use the `<WHEN>` value from Step 2):

```json
    {
      "idx": 15,
      "version": "7",
      "when": <WHEN>,
      "tag": "0015_household_name_trgm",
      "breakpoints": true
    }
```

Do NOT create a snapshot file — hand-written migrations 0006–0014 have none; follow that convention.

- [ ] **Step 4: Verify the journal is valid and monotonic**

Run: `node -e "JSON.parse(require('fs').readFileSync('lib/db/migrations/meta/_journal.json','utf8')); console.log('json ok')"`
Expected: `json ok`.

Run: `npm run test:run -- lib/db/journal.test.ts`
Expected: PASS (3 tests) — confirms the new `when` is strictly greater than the previous entry's (the #14 guardrail).

- [ ] **Step 5: Commit**

```bash
git add lib/db/migrations/0015_household_name_trgm.sql lib/db/migrations/meta/_journal.json
git commit -m "feat(db): trgm index on full household name; drop surname-only index (#17)"
```

---

### Task 3: Wire token matching into both search routes

**Files:**
- Modify: `app/api/houses/search/route.ts`
- Modify: `app/api/businesses/search/route.ts`

**Interfaces:**
- Consumes: `tokenPatterns`, `ilikeAllTokens` from `@/lib/search` (Task 1); the canonical household-name expression from Task 2.

- [ ] **Step 1: Rewrite the houses search route**

Replace the entire body of `app/api/houses/search/route.ts` with:

```ts
export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql } from 'drizzle-orm'
import { tokenPatterns, ilikeAllTokens } from '@/lib/search'

// Shared column list
const HOUSE_COLS = (alias = 'h') => sql`
  ${sql.raw(alias)}.id,
  ${sql.raw(alias)}.number,
  ${sql.raw(alias)}.street,
  ${sql.raw(alias)}.unit,
  ${sql.raw(alias)}.city,
  ${sql.raw(alias)}.region,
  ${sql.raw(alias)}.postcode,
  ${sql.raw(alias)}.external_id       AS "externalId",
  ST_Y(${sql.raw(alias)}.location)    AS lat,
  ST_X(${sql.raw(alias)}.location)    AS lng,
  ${sql.raw(alias)}.neighborhood_id   AS "neighborhoodId",
  ${sql.raw(alias)}.do_not_knock      AS "doNotKnock",
  ${sql.raw(alias)}.no_soliciting_sign AS "noSolicitingSign",
  ${sql.raw(alias)}.created_at        AS "createdAt",
  ${sql.raw(alias)}.status_id           AS "statusId"
`

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (!q) return NextResponse.json([])

  const patterns = tokenPatterns(q)

  // Two separate trgm-indexed searches UNION'd together. Each branch keeps its
  // own expression so its trigram index applies; token AND-matching is an
  // AND-chain of per-token ILIKEs (BitmapAnd), never OR + lateral join.
  const rows = await db.execute(sql`
    (
      SELECT ${HOUSE_COLS()}, NULL::text AS surname, NULL::text AS "headOfHouseholdName", NULL::text AS "spouseName"
      FROM houses h
      WHERE ${ilikeAllTokens(sql`(h.number || ' ' || h.street)`, patterns)}
      ORDER BY h.street, h.number
      LIMIT 8
    )
    UNION
    (
      SELECT ${HOUSE_COLS()}, ho.surname, ho.head_of_household_name AS "headOfHouseholdName", ho.spouse_name AS "spouseName"
      FROM households ho
      JOIN houses h ON h.id = ho.house_id
      WHERE ${ilikeAllTokens(
        sql`(COALESCE(ho.surname, '') || ' ' || COALESCE(ho.head_of_household_name, '') || ' ' || COALESCE(ho.spouse_name, ''))`,
        patterns,
      )} AND ho.active = true
      ORDER BY h.street, h.number
      LIMIT 8
    )
    ORDER BY street, number
    LIMIT 8
  `)

  return NextResponse.json(rows.rows)
})
```

- [ ] **Step 2: Rewrite the businesses search route**

Replace the entire body of `app/api/businesses/search/route.ts` with:

```ts
export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql } from 'drizzle-orm'
import { tokenPatterns, ilikeAllTokens } from '@/lib/search'

const BUSINESS_COLS = sql`
  businesses.id, businesses.name, businesses.type, businesses.category,
  businesses.number, businesses.street, businesses.city, businesses.region,
  businesses.postcode, businesses.phone, businesses.website,
  businesses.external_id as "externalId",
  ST_Y(businesses.location) as lat, ST_X(businesses.location) as lng,
  businesses.neighborhood_id as "neighborhoodId",
  businesses.status_id as "statusId",
  businesses.created_at as "createdAt"
`

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (!q) return NextResponse.json([])

  const patterns = tokenPatterns(q)

  // Two trgm-indexed searches UNION'd. Pattern matches the houses search route.
  const rows = await db.execute(sql`
    (
      SELECT ${BUSINESS_COLS}
      FROM businesses
      WHERE ${ilikeAllTokens(sql`businesses.name`, patterns)}
      ORDER BY businesses.name
      LIMIT 8
    )
    UNION
    (
      SELECT ${BUSINESS_COLS}
      FROM businesses
      WHERE ${ilikeAllTokens(
        sql`(COALESCE(businesses.number, '') || ' ' || COALESCE(businesses.street, ''))`,
        patterns,
      )}
      ORDER BY businesses.street, businesses.number
      LIMIT 8
    )
    ORDER BY name
    LIMIT 8
  `)

  return NextResponse.json(rows.rows)
})
```

- [ ] **Step 3: Typecheck, lint, build**

Run each and expect success:
- `npx tsc --noEmit` — clean.
- `npm run lint` — exits 0 (the gate restored in #15).
- `npm run test:run` — the full suite is green except the known env-only `lib/auth.test.ts` failure (present on main); your new `lib/search.test.ts` passes.

(The mock route-test harness from #16 verifies guard/validation logic, not SQL; SQL correctness is verified in Task 4. No route harness test is required here — the change is confined to the WHERE expressions.)

- [ ] **Step 4: Commit**

```bash
git add app/api/houses/search/route.ts app/api/businesses/search/route.ts
git commit -m "feat: token AND-matching + full-name search in house/business search (#17)"
```

---

### Task 4: Neon-branch verification (functional + EXPLAIN)

**Files:** none (verification only).

This task needs `NEON_API_KEY` (or `neonctl` auth) and the production `DATABASE_URL`/project. If those secrets are unavailable in your environment, report NEEDS_CONTEXT with this task's commands so the controller runs it — do not skip it, and do not run against production directly.

**Interfaces:**
- Consumes: the migration (Task 2) and routes (Task 3).

- [ ] **Step 1: Create a disposable branch off production**

Follow the neon-postgres skill's branching workflow. Create a branch of the prod project, capture its pooled connection string as `BRANCH_URL`. (E.g. `neonctl branches create --name smoke-17-$(date +%s) --project-id <PROD_PROJECT> ...` then fetch the connection URI.)

- [ ] **Step 2: Apply migrations to the branch**

Run drizzle migrate against the branch (all migrations, including 0015):
```bash
DATABASE_URL="$BRANCH_URL" node node_modules/.bin/drizzle-kit migrate
```
Expected: completes; `0015_household_name_trgm` applies (creates `households_name_trgm_idx`, drops `households_surname_trgm_idx`).

- [ ] **Step 3: Functional checks — the issue's failing cases now match**

Against `BRANCH_URL`, run these and confirm each returns ≥ 1 row (use `psql "$BRANCH_URL"` or the neon SQL editor):

```sql
-- address token order / omitted directional
SELECT 1 FROM houses h
WHERE (h.number || ' ' || h.street) ILIKE '%2805%' AND (h.number || ' ' || h.street) ILIKE '%apache%'
LIMIT 1;

SELECT 1 FROM houses h
WHERE (h.number || ' ' || h.street) ILIKE '%1060%'
  AND (h.number || ' ' || h.street) ILIKE '%450%'
  AND (h.number || ' ' || h.street) ILIKE '%north%'
LIMIT 1;

-- name: first name and spouse name now searchable
SELECT 1 FROM households ho
WHERE (COALESCE(ho.surname,'') || ' ' || COALESCE(ho.head_of_household_name,'') || ' ' || COALESCE(ho.spouse_name,'')) ILIKE '%brett%'
  AND ho.active = true LIMIT 1;

SELECT 1 FROM households ho
WHERE (COALESCE(ho.surname,'') || ' ' || COALESCE(ho.head_of_household_name,'') || ' ' || COALESCE(ho.spouse_name,'')) ILIKE '%nicole%'
  AND ho.active = true LIMIT 1;
```
(If a specific street/household isn't present in prod data, substitute a token pair known to exist; the point is to prove multi-token AND-matching and full-name matching return rows.)

- [ ] **Step 4: EXPLAIN — confirm index usage, no seq scan**

```sql
EXPLAIN ANALYZE
SELECT h.id FROM houses h
WHERE (h.number || ' ' || h.street) ILIKE '%2805%' AND (h.number || ' ' || h.street) ILIKE '%apache%'
LIMIT 8;

EXPLAIN ANALYZE
SELECT ho.id FROM households ho
WHERE (COALESCE(ho.surname,'') || ' ' || COALESCE(ho.head_of_household_name,'') || ' ' || COALESCE(ho.spouse_name,'')) ILIKE '%michaelis%'
  AND ho.active = true LIMIT 8;
```
Expected: bitmap index scans on `houses_address_trgm_idx` and `households_name_trgm_idx` respectively (BitmapAnd when ≥ 2 tokens), NOT a `Seq Scan` on `houses` / `households`. Record the plan lines in the report.

- [ ] **Step 5: Delete the branch**

Delete the disposable branch (`neonctl branches delete <branch-id> --project-id <PROD_PROJECT>`). Confirm it's gone. Record command output in the report. No commit (verification only).

---

## Notes for the executor

- Tasks 1–3 are hermetic (no DB). Task 4 requires DB credentials and is the only place index/SQL correctness is proven end-to-end.
- The household-name expression appears in three places — the migration index (Task 2), the houses route name branch (Task 3), and the EXPLAIN checks (Task 4). It must be structurally identical in all three or the index won't be used. Copy it verbatim.
- Do not add a `meta/0015_snapshot.json` — the hand-written migration convention here omits snapshots.
