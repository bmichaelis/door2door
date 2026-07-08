# Route-Test Harness + Lint Fix — Design

**Issues:** #16 (route-test harness) + #15 (broken `npm run lint`) · **Date:**
2026-07-08 · **Status:** Approved (user present; harness type and lint
approach chosen). One dev-infra branch, two independent concerns, no runtime/
feature surface.

## Why now

Nine features in, every final review flagged the same gap: the security-
critical route logic (`requireRole` gates, system-row protection, the
`{active:0}` deactivation bypass, "assignee must be a rep", 400/404
ordering) is verified only by inspection, because route handlers can't be
imported under vitest (`lib/db` connects to Neon at module load; `lib/auth`
needs `AUTH_*`). And `npm run lint` has never run — there's no lint gate at
all. Both are compounding debt; this branch pays them down.

## Part A — Lint (#15)

`eslint.config.mjs` spreads `eslint-config-next`'s exports as if they were
flat-config arrays, but the installed version (`^15.0.0`) exports the legacy
eslintrc shape `{ extends: [...] }` → `TypeError: nextVitals is not
iterable`, so ESLint 9 can't load the config at all.

**Fix: wrap with `FlatCompat`** (add `@eslint/eslintrc` devDependency) rather
than bump `eslint-config-next` to 15.5. Rationale: bumping the config package
would change the rule set and likely surface a pile of new violations,
turning a gate-fix into an open-ended cleanup. FlatCompat loads the *current*
config unchanged — smallest change that makes `eslint` run.

```js
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })
const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  { ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts', '.vercel/**'] },
]
export default eslintConfig
```

**Surfaced-violations rule:** once lint runs for the first time it may report
pre-existing violations. Fix genuine *errors* inline in this branch. If the
count is unreasonable (say >15) or a rule fights the codebase's established
style, disable that specific rule in the config with a one-line comment
explaining why, and file a follow-up cleanup issue — do not balloon this
branch chasing blanket cleanliness. The branch's success bar is **`npm run
lint` exits 0**, not "zero suppressions".

## Part B — Route-test harness (#16)

**Mock-based** (chosen over Neon-branch/PGlite): stub `auth()` and `@/lib/db`,
invoke the exported handler, assert on the returned `NextResponse`. Hermetic,
no secrets, runs in CI immediately, and targets exactly the guard/validation
branching the reviews flagged. SQL correctness is explicitly out of scope
(the pure helpers — `requireRole`, `canDeleteNote`, `visitAutoKey`, … — are
already unit-tested; this covers their *wiring* into handlers).

### `test/route-harness.ts`

- `jsonRequest(method: string, url: string, body?: unknown): NextRequest` —
  builds a `NextRequest` with JSON body + header (for GET/DELETE, no body).
- `params(obj: Record<string,string>)` → `{ params: Promise.resolve(obj) }`,
  the `ctx` shape route handlers destructure (`await params`).
- `chainDb()` — a chainable `db` mock factory. Returns an object implementing
  the drizzle surfaces the routes use — `select().from().where()`,
  `insert().values().returning()` / `.onConflictDoNothing()`,
  `update().set().where().returning()`, `delete().where()`, and
  `execute()` — where each terminal resolves to a per-test-configured value.
  Shape: `const db = chainDb({ select: [[row]], execute: [{ rows: [...] }],
  update: [[row]] })` queues results consumed in call order. Kept minimal —
  only the methods the covered routes actually invoke; extended as future
  routes need new surfaces.

Each test file declares the hoisted mocks literally (vi.mock can't be wrapped
in a helper) — documented as a copy-paste header in the harness file's top
comment:

```ts
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: chainDbSingleton }))
```

(The db-mock indirection so the same instance is both injected into the
module and configured by the test — the harness documents the exact pattern
that works with vi.mock hoisting; if a clean singleton proves awkward under
hoisting, the harness exposes a `setDbResults()` the test calls in
`beforeEach` instead. The implementer picks whichever vitest actually
honors — the deliverable is a working, documented, reusable pattern.)

### Proof-of-pattern tests (this branch)

Cover the most invariant-heavy routes — enough to prove the harness and lock
the guards the reviews cared about, NOT to backfill every route:

- `app/api/statuses/[id]/route.ts`: PATCH rejects deactivating a system row
  incl. the `{active:0}` coercion (400); DELETE of a system row → 400;
  DELETE unknown id → 404; DELETE custom row → 204.
- `app/api/neighborhoods/[id]/route.ts`: PATCH by a rep → 403 (requireRole);
  a manager sending a legacy admin field → 403; `assignedUserId` pointing at
  a non-rep → 400.
- One clean `requireRole` rejection: `POST /api/statuses` as a rep → 403
  (exercises the `ForbiddenError → 403` path through `withErrorHandling`).

### Docs

A short `test/README.md` (or top-comment in the harness) showing the mock
header + one worked example, so future route work adopts the pattern. Update
issue #16's "no route-level test harness" note is obsolete once merged.

## Testing

The harness *is* test infrastructure; its correctness is demonstrated by the
proof-of-pattern tests passing. Gates: `npx tsc --noEmit`, `npm run test:run`
(new route tests green; the historically-flaky `lib/auth.test.ts` should now
also be reconsidered — if the harness's `auth` mock pattern or the existing
`vitest.setup.ts` env stubs make it pass, note it; if it still fails, leave
it, it's not in scope), **and `npm run lint` (exits 0 — the new gate)**,
`next build`.

## Out of scope

Real-SQL/integration tests; blanket route coverage (only the invariant-heavy
routes here); wiring lint into CI (`.github/workflows` — a follow-up once the
gate is known-green locally); fixing `lib/auth.test.ts` if it remains
env-dependent.
