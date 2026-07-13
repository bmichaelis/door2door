# Migration Journal `when` Guardrail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fail the test suite whenever a drizzle migration journal entry's `when` timestamp is not strictly greater than the previous entry's, so a backdated entry can never again be silently skipped by `drizzle-kit migrate`.

**Architecture:** A pure, dependency-free helper (`lib/db/journal.ts`) reads `lib/db/migrations/meta/_journal.json` and reports any non-increasing `when`; a colocated vitest test (`lib/db/journal.test.ts`) asserts the real journal is clean and proves the check catches synthetic violations. The two pre-existing backdated entries (idx 2 and 7) are grandfathered via an explicit allowlist. The convention is documented in a colocated migrations README, with a pointer from AGENTS.md.

**Tech Stack:** TypeScript (ESM, `module: esnext`, `strict: true`), vitest, Node `fs`/`url`. No new dependencies.

## Global Constraints

- No new dependencies; helpers are pure — no DB, network, or I/O beyond reading the journal file.
- Grandfather **only** idx `2` and `7`. Do not add other indices to the allowlist.
- Match the existing test style: `import { describe, it, expect } from 'vitest'`, colocated `*.test.ts`, explicit imports (do not rely on `globals`).
- Gates for every task: `npx tsc --noEmit` clean and `npm run test:run` green.
- AGENTS.md content between `<!-- BEGIN:nextjs-agent-rules -->` and `<!-- END:nextjs-agent-rules -->` is machine-managed — never edit inside it; append new content **after** the END marker.
- Out of scope: the prod `drizzle.__drizzle_migrations` audit/backfill; rewriting the `when` of 0002/0007; wiring tests into CI (owned by #32); any journal check other than `when` ordering.

---

### Task 1: The guardrail check (`lib/db/journal.ts` + test)

**Files:**
- Create: `lib/db/journal.ts`
- Test: `lib/db/journal.test.ts`

**Interfaces:**
- Consumes: `lib/db/migrations/meta/_journal.json` (existing, shape `{ entries: { idx: number; when: number; tag: string; ... }[] }`).
- Produces:
  - `interface JournalEntry { idx: number; when: number; tag: string }`
  - `interface WhenOrderViolation { idx: number; tag: string; when: number; prevTag: string; prevWhen: number }`
  - `const GRANDFATHERED_IDX: ReadonlySet<number>` (= `{2, 7}`)
  - `function readJournal(): JournalEntry[]` — entries sorted by `idx`
  - `function findWhenOrderViolations(entries: JournalEntry[], grandfathered?: ReadonlySet<number>): WhenOrderViolation[]`

- [ ] **Step 1: Write the failing test**

Create `lib/db/journal.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  readJournal,
  findWhenOrderViolations,
  GRANDFATHERED_IDX,
  type JournalEntry,
} from './journal'

describe('migration journal when-ordering', () => {
  it('the real journal has no violations (given grandfathered entries)', () => {
    const violations = findWhenOrderViolations(readJournal(), GRANDFATHERED_IDX)
    expect(violations).toEqual([])
  })

  it('flags a backdated entry when nothing is grandfathered', () => {
    const entries: JournalEntry[] = [
      { idx: 0, when: 1000, tag: '0000_a' },
      { idx: 1, when: 2000, tag: '0001_b' },
      { idx: 2, when: 1500, tag: '0002_backdated' },
    ]
    const violations = findWhenOrderViolations(entries)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({
      idx: 2,
      tag: '0002_backdated',
      when: 1500,
      prevTag: '0001_b',
      prevWhen: 2000,
    })
  })

  it('still flags a new backdated entry even though idx 2 and 7 are grandfathered', () => {
    const entries = readJournal()
    const last = entries[entries.length - 1]
    const withBadNew: JournalEntry[] = [
      ...entries,
      { idx: 15, when: last.when - 1, tag: '0015_backdated' },
    ]
    const violations = findWhenOrderViolations(withBadNew, GRANDFATHERED_IDX)
    expect(violations).toHaveLength(1)
    expect(violations[0].idx).toBe(15)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- lib/db/journal.test.ts`
Expected: FAIL — cannot resolve `./journal` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/db/journal.ts`:

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export interface JournalEntry {
  idx: number
  when: number
  tag: string
}

export interface WhenOrderViolation {
  idx: number
  tag: string
  when: number
  prevTag: string
  prevWhen: number
}

/**
 * Journal entries authored before the strictly-increasing-`when` convention
 * (#14). Their `when` values are backdated and cannot be corrected without
 * backfilling the prod `drizzle.__drizzle_migrations` ledger, which is out of
 * scope for #14. Both are IF NOT EXISTS-safe and already present in prod.
 * See lib/db/migrations/README.md. Do NOT add new indices here — fix the
 * `when` instead.
 */
export const GRANDFATHERED_IDX: ReadonlySet<number> = new Set([2, 7])

const JOURNAL_PATH = fileURLToPath(
  new URL('./migrations/meta/_journal.json', import.meta.url),
)

/** Reads and parses the drizzle migration journal, entries sorted by idx. */
export function readJournal(): JournalEntry[] {
  const raw = readFileSync(JOURNAL_PATH, 'utf8')
  const parsed = JSON.parse(raw) as { entries: JournalEntry[] }
  return [...parsed.entries].sort((a, b) => a.idx - b.idx)
}

/**
 * Returns every entry whose `when` is NOT strictly greater than the previous
 * entry's `when`, skipping any entry whose idx is in `grandfathered`. An empty
 * array means the journal is healthy.
 */
export function findWhenOrderViolations(
  entries: JournalEntry[],
  grandfathered: ReadonlySet<number> = new Set(),
): WhenOrderViolation[] {
  const violations: WhenOrderViolation[] = []
  for (let i = 1; i < entries.length; i++) {
    const entry = entries[i]
    const prev = entries[i - 1]
    if (grandfathered.has(entry.idx)) continue
    if (entry.when <= prev.when) {
      violations.push({
        idx: entry.idx,
        tag: entry.tag,
        when: entry.when,
        prevTag: prev.tag,
        prevWhen: prev.when,
      })
    }
  }
  return violations
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- lib/db/journal.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/db/journal.ts lib/db/journal.test.ts
git commit -m "test: guard migration journal against backdated when timestamps (#14)"
```

---

### Task 2: Document the convention (`README.md` + AGENTS.md pointer)

**Files:**
- Create: `lib/db/migrations/README.md`
- Modify: `AGENTS.md` (append after the `<!-- END:nextjs-agent-rules -->` marker)

**Interfaces:**
- Consumes: the names produced by Task 1 (`lib/db/journal.ts`, `lib/db/journal.test.ts`, `GRANDFATHERED_IDX`) — reference them accurately in the prose.
- Produces: nothing consumed by later tasks (final task).

- [ ] **Step 1: Create the migrations README**

Create `lib/db/migrations/README.md`:

```markdown
# Database migrations

Hand-written SQL migrations live here, each paired with an entry in
`meta/_journal.json`.

## The `when` rule (read before hand-editing the journal)

Every entry in `meta/_journal.json` has a `when` (epoch milliseconds). **A new
entry's `when` MUST be the real current time at authoring (`Date.now()`) and
strictly greater than the previous entry's `when`. Never backdate it.**

### Why this matters

`drizzle-kit migrate` only applies a journal entry whose `when` is newer than
the most recently applied migration's timestamp. An entry with a `when` that is
*older* than an already-applied migration is **silently skipped forever** —
`migrate` still prints success. This caused a production outage (#14):
`0007_households_spouse_name` was backdated below `0006`, never ran, and
`households.spouse_name` was missing in prod for weeks — 500ing first-visit
logging and house search until it was patched by hand.

`drizzle-kit generate` sets `when` correctly on its own. This rule matters only
when you author or edit a journal entry by hand.

### Enforcement

`lib/db/journal.test.ts` fails the test suite if any entry's `when` is not
strictly greater than the previous entry's. Run it with `npm run test:run`.

### Grandfathered entries

`0002_houses_structured_fields` (idx 2) and `0007_households_spouse_name`
(idx 7) were backdated before this rule existed and are exempted in
`lib/db/journal.ts` (`GRANDFATHERED_IDX`). They cannot be corrected without
backfilling the prod `drizzle.__drizzle_migrations` ledger, which is out of
scope. Both are `IF NOT EXISTS`-safe and already present in the prod schema. Do
not add new indices to that set — fix the `when` instead.
```

- [ ] **Step 2: Append the pointer to AGENTS.md**

Append the following to the end of `AGENTS.md` (after the existing `<!-- END:nextjs-agent-rules -->` line — do not touch the marked block):

```markdown

## Database migrations

Before hand-editing `lib/db/migrations/meta/_journal.json`, read
`lib/db/migrations/README.md`: a new entry's `when` must be the real current
epoch-ms and strictly greater than the previous entry's, or `drizzle-kit`
silently skips the migration.
```

- [ ] **Step 3: Verify referenced paths exist and gates still pass**

Run: `ls lib/db/journal.ts lib/db/journal.test.ts lib/db/migrations/meta/_journal.json && npx tsc --noEmit && npm run test:run -- lib/db/journal.test.ts`
Expected: all three paths listed (the README's references are valid), tsc clean, tests green.

- [ ] **Step 4: Commit**

```bash
git add lib/db/migrations/README.md AGENTS.md
git commit -m "docs: document strictly-increasing journal when convention (#14)"
```

---

## Notes for the executor

- `lib/db/journal.ts` is a dev/test-only helper — it is never imported by app runtime code, so Node `fs`/`url` and `import.meta.url` are safe here (they only run under vitest/node, not on the Cloudflare edge).
- The real journal's last entry is idx 14; Task 1's third test appends a synthetic idx 15, which is deliberately not in `GRANDFATHERED_IDX`.
- If `npm run test:run -- <path>` filters oddly in this vitest version, fall back to `npm run test:run` (whole suite) — the new file will be included.
