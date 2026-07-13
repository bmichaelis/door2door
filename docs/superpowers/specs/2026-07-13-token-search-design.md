# Token-Based Search — Design

**Issue:** #17 · **Date:** 2026-07-13 · **Status:** Approved (user present;
name-branch index strategy and EXPLAIN target chosen).

## Why

House/business search does a single substring match over a concatenated
expression, so any token the user omits *between* words they typed breaks the
match. `2805 apache` returns nothing because the stored value is
`2805 N APACHE LN` (the directional `N` breaks the substring); `1060 450 north`
misses `1060 E 450 NORTH ST`. Directionals are on nearly every Utah address, so
this bites constantly. Separately, the name branch matches `surname` only, so
`brett` or `nicole` finds nothing for the `MICHAELIS, BRETT AND NICOLE`
household even though those names are displayed in results.

## Approach

Preserve the existing structure: each search is a UNION of per-branch,
trgm-indexed `ILIKE` searches. That split is deliberate — an earlier single
query with `OR` + lateral join forced 243K lateral executions and defeated the
trigram index. The change adds **token AND-matching** (every whitespace-split
token must match, in any order) in an **index-friendly form**, and gives the
widened name branch an index matching its new expression.

**Token form — explicit AND-chain, not `ILIKE ALL`.** The issue proposed
`expr ILIKE ALL(ARRAY['%a%','%b%'])`, but that is a single ScalarArrayOp the GIN
trgm index cannot serve — it would seq-scan. Expanding to
`expr ILIKE '%a%' AND expr ILIKE '%b%'` produces separate `~~*` ops, each served
by a bitmap index scan on the expression's trgm index and combined with
`BitmapAnd`. This is what yields the indexed behavior the issue intended.

## Components

### `lib/search.ts` (new — pure helpers, unit-tested)

```ts
import { sql, type SQL } from 'drizzle-orm'

/** Split a query into `%token%` ILIKE patterns. Empty/whitespace → []. */
export function tokenPatterns(q: string): string[] {
  return q.trim().split(/\s+/).filter(Boolean).map((t) => '%' + t + '%')
}

/**
 * AND-chain of `expr ILIKE <pattern>` over every pattern, parenthesized.
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

Consumers: both search routes. Consumers depend on these two signatures.

### `app/api/houses/search/route.ts`

- Build `const patterns = tokenPatterns(q)` (after the existing empty-`q`
  guard, which stays).
- Address branch WHERE: `${ilikeAllTokens(sql`(h.number || ' ' || h.street)`, patterns)}`.
  Expression unchanged → `houses_address_trgm_idx` still applies.
- Name branch WHERE: replace `ho.surname ILIKE ${pattern}` with
  `${ilikeAllTokens(sql`(COALESCE(ho.surname, '') || ' ' || COALESCE(ho.head_of_household_name, '') || ' ' || COALESCE(ho.spouse_name, ''))`, patterns)} AND ho.active = true`.
  The SELECT already returns `surname`, `headOfHouseholdName`, `spouseName` — no
  SELECT change.
- `HOUSE_COLS`, UNION structure, `ORDER BY`, `LIMIT 8` unchanged.

### `app/api/businesses/search/route.ts`

- `const patterns = tokenPatterns(q)` after the empty-`q` guard.
- Name branch: `${ilikeAllTokens(sql`businesses.name`, patterns)}` →
  `businesses_name_trgm_idx` still applies.
- Address branch: `${ilikeAllTokens(sql`(COALESCE(businesses.number, '') || ' ' || COALESCE(businesses.street, ''))`, patterns)}`
  → `businesses_address_trgm_idx` still applies.
- Structure, ordering, limits unchanged.

### Migration `lib/db/migrations/0015_household_name_trgm.sql` (new)

```sql
CREATE INDEX IF NOT EXISTS households_name_trgm_idx
  ON households USING GIN ((COALESCE(surname, '') || ' ' || COALESCE(head_of_household_name, '') || ' ' || COALESCE(spouse_name, '')) gin_trgm_ops);

DROP INDEX IF EXISTS households_surname_trgm_idx;
```

- The index expression's **structure must match** the name branch's WHERE
  expression — same columns, same `COALESCE(..., '')` defaults, same `' '`
  separators, same order — or the planner will not use it. The table alias is
  irrelevant: `COALESCE(ho.surname, '')` in the query matches
  `COALESCE(surname, '')` in the index (both resolve to `households.surname`).
- The old surname-only index is superseded (all name searches now match the
  concat expression) and dropped.
- Journal entry (`_journal.json`) is the **first migration authored under the
  #14 guardrail**: `when` MUST be real current epoch-ms (`Date.now()`) and
  strictly greater than idx 14's `when` (`1783467229017`). `lib/db/journal.test.ts`
  will fail the suite otherwise. Add via `drizzle-kit generate` or by hand
  following `lib/db/migrations/README.md`.

## Testing / Verification

- **Unit** (`lib/search.test.ts`): `tokenPatterns` — multi-space, leading/
  trailing space, single token, whitespace-only → `[]`; `ilikeAllTokens` emits
  one `ILIKE` condition per token joined by `AND`.
- **Neon-branch smoke** (disposable branch off prod, per the established
  precedent — never against prod): apply migrations, then
  1. functional: the issue's cases return the expected rows — `2805 apache`,
     `1060 450 north` (address), `brett` and `nicole` (name, for the
     `MICHAELIS, BRETT AND NICOLE` household);
  2. `EXPLAIN ANALYZE` on each branch confirms bitmap index scans + `BitmapAnd`
     on the trgm indexes (including the new `households_name_trgm_idx`) and no
     seq scan on `houses`/`households`/`businesses`;
  3. delete the branch.

## Out of scope

Ranking/relevance changes (keep current `ORDER BY street, number` / `name`,
`LIMIT 8`); fuzzy/similarity scoring; search UI changes; any new index beyond
`households_name_trgm_idx`.
