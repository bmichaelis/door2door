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
