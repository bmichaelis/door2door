# Migration Journal `when` Guardrail — Design

**Issue:** #14 (scoped to the guardrail only) · **Date:** 2026-07-13 ·
**Status:** Approved (user present; enforcement mechanism and existing-violation
handling chosen).

## Why

Hand-written migrations get manual entries in
`lib/db/migrations/meta/_journal.json`. drizzle-kit's `migrate` only applies a
journal entry whose `when` is newer than the last applied migration's
timestamp, so an entry with a **backdated `when`** is silently skipped forever
while `migrate` still reports success. This already caused a production outage:
`0007_households_spouse_name` (`when` Apr 2025, older than `0006`'s Apr 2026)
never ran, so `households.spouse_name` was missing in prod — 500ing first-visit
logging and house search — from the day it shipped until it was patched by hand
on 2026-07-06. `0002_houses_structured_fields` is backdated the same way.

This guardrail prevents recurrence: it fails the test suite if any journal
entry's `when` is not strictly greater than the previous entry's.

## Scope

**In:** (1) document the strictly-increasing-`when` convention where a migration
author will see it; (2) an automated check (a vitest test) that fails when the
convention is violated, with the guard logic itself unit-tested.

**Out** (explicitly): the live prod `__drizzle_migrations` drift audit/backfill;
rewriting the two existing backdated entries (a real fix needs the prod-ledger
backfill this issue excludes); wiring tests into CI (that is #32 — this design
only *adds* the test so #32's gate enforces it once it lands); any journal check
beyond `when` ordering (no idx-contiguity or sql-file-existence checks — YAGNI).

## Decisions

- **Enforcement = a vitest test.** Matches the existing pattern (colocated
  `*.test.ts` under `lib/`, run via `npm run test:run`), adds zero
  dependencies, and is picked up by any future CI test gate. Rejected: a
  standalone script (runs only when invoked) and a husky pre-commit hook (new
  dependency + setup, none exists today).
- **The two existing violations (idx 2 and idx 7) are grandfathered**, not
  fixed. Rewriting their `when` would make drizzle-kit attempt to re-apply them
  and would require backfilling the prod `__drizzle_migrations` ledger — the
  live-DB work this issue scopes out. An explicit allowlist keeps the guardrail
  fully local while still enforcing monotonicity for every other entry,
  including all future ones.

## Components (all under `lib/db/`)

### `lib/db/journal.ts` — pure helpers (no DB, no I/O beyond reading the file)

```ts
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

// Entries that predate the strictly-increasing-`when` convention (#14). Their
// `when` values are backdated and cannot be corrected without backfilling the
// prod __drizzle_migrations ledger, which is out of scope for #14. Both are
// IF NOT EXISTS-safe and already reflected in the prod schema.
export const GRANDFATHERED_IDX: ReadonlySet<number>

// Reads and parses lib/db/migrations/meta/_journal.json into typed entries,
// sorted by idx.
export function readJournal(): JournalEntry[]

// Returns every entry whose `when` is NOT strictly greater than the previous
// entry's `when`, skipping any entry in `grandfathered`. Empty array = healthy.
export function findWhenOrderViolations(
  entries: JournalEntry[],
  grandfathered?: ReadonlySet<number>,
): WhenOrderViolation[]
```

`findWhenOrderViolations` walks entries in `idx` order; for each entry `i > 0`
it compares `entries[i].when` to `entries[i-1].when`. If `entries[i].when <=`
the previous and `i` is not grandfathered, it records a violation. Comparison is
always against the immediate predecessor (a grandfathered predecessor with a low
`when` only makes the successor *more* likely to pass, which is fine — the goal
is to catch backdated *new* entries).

### `lib/db/journal.test.ts` — three cases

1. **Regression guard:** `findWhenOrderViolations(readJournal(), GRANDFATHERED_IDX)`
   returns `[]` — the real journal is healthy under the grandfather set.
2. **Catches a backdated entry:** a synthetic entry list with a backdated
   `when` (no grandfathering) yields exactly one violation naming that entry —
   proves the check fails when it should, not merely passes on today's data.
3. **Future entries are enforced:** a synthetic list mirroring the real journal
   plus a new `idx: 15` whose `when` is below `idx: 14`, checked with
   `GRANDFATHERED_IDX` — still flagged, proving grandfathering 2 & 7 does not
   exempt new entries.

### `lib/db/migrations/README.md` — the convention

Colocated with the journal so it is seen at authoring time. States: a
hand-written journal entry's `when` MUST be the real current epoch-ms
(`Date.now()`) at authoring time and strictly greater than the previous entry's
`when`; never backdate. Explains the drizzle-kit silent-skip failure mode with
the #14 outage as the cautionary example, and notes that idx 2 and 7 are
grandfathered exceptions and why.

### `AGENTS.md` — one-line pointer

A single line directing anyone hand-editing migrations to
`lib/db/migrations/README.md`, so agent sessions surface the rule before
touching the journal.

## Failure UX

The test assertion message names the offending `tag`, its `when`, and the
predecessor's `tag`/`when`, and points to `lib/db/migrations/README.md` — enough
to diagnose and fix without opening the test.

## Testing

The check is itself test infrastructure; its correctness is demonstrated by
cases 2 and 3 above (synthetic violations are caught) alongside case 1 (the real
journal passes). Gates: `npm run test:run` green, `tsc --noEmit` clean.
