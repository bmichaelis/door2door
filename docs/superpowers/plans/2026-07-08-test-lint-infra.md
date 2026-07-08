# Route-Test Harness + Lint Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm run lint` run (#15) and give edge API route handlers a hermetic mock-based test harness with proof-of-pattern coverage of the security-critical guards (#16).

**Architecture:** #15 — wrap the legacy `eslint-config-next` with `FlatCompat` so ESLint 9 loads it unchanged. #16 — a `test/route-harness.ts` (NextRequest builder, `params` ctx, singleton chainable `db` mock) that tests reference via `vi.mock('@/lib/db', …)` + `vi.mock('@/lib/auth', …)`, then invoke the exported handler and assert on the returned `NextResponse`.

**Tech Stack:** ESLint 9 flat config + `@eslint/eslintrc` FlatCompat, Next 15 App Router route handlers, vitest.

## Global Constraints

- Code style: no semicolons, single quotes, 2-space indent.
- Lint fix uses `FlatCompat` wrapping the CURRENT `eslint-config-next` (do NOT bump it). Success bar: `npm run lint` exits 0.
- Harness is mock-based: stub `auth()` and `@/lib/db`; no real DB, no secrets, no network. SQL correctness is explicitly NOT tested.
- Route tests assert primarily on HTTP status codes (durable); assert response-body error text only where this plan quotes it verbatim from the route.
- Gates: `npx tsc --noEmit`, `npm run test:run`, `npm run lint` (the new gate — must exit 0), `next build` (dummy env). The pre-existing `lib/auth.test.ts` env behavior is out of scope; note its state, don't chase it.
- Commits reference `#16`/`#15`; end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Run all `npm`/`npx` from the worktree root. `npm install` there is fine (node_modules resolves).

---

### Task 1: Fix `npm run lint` (#15)

**Files:**
- Modify: `eslint.config.mjs`
- Modify: `package.json` + `package-lock.json` (add `@eslint/eslintrc`)
- Possibly modify: source files with surfaced lint errors (see Step 4)

**Interfaces:**
- Produces: a working `npm run lint`. No code interface.

- [ ] **Step 1: Add the FlatCompat dependency** — from the worktree root:

```bash
npm install -D @eslint/eslintrc
```

- [ ] **Step 2: Rewrite `eslint.config.mjs`** to wrap the legacy config:

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

- [ ] **Step 3: Run lint** — `npm run lint`
Expected: it now RUNS (no more `nextVitals is not iterable`). It either exits 0, or prints a finite list of violations.

- [ ] **Step 4: Resolve surfaced violations** — apply this decision rule:
  - **Exits 0** → nothing to do, proceed.
  - **A small set of genuine errors (≤15 total)** → fix them inline in the offending source files (the fixes depend on what surfaces — typical: unused vars, `prefer-const`, unescaped entities). Re-run `npm run lint` until it exits 0.
  - **An unreasonable pile, or a rule fighting the codebase's established style** (e.g. a stylistic rule flagging hundreds of lines) → disable that specific rule by appending a config block with an explanatory comment, e.g.:

```js
  // <rule> conflicts with the established <X> convention across the codebase;
  // re-enable and clean up separately (follow-up issue filed).
  { rules: { '<rule-id>': 'off' } },
```

  and note it for the final review. Do NOT hand-fix hundreds of lines in this branch. Re-run until `npm run lint` exits 0.

- [ ] **Step 5: Confirm the gate** — `npm run lint`
Expected: exit code 0 (print nothing, or only warnings if the project distinguishes warn/error — the bar is exit 0).

- [ ] **Step 6: Commit**

```bash
git add eslint.config.mjs package.json package-lock.json
# plus any source files fixed in Step 4
git commit -m "fix: make npm run lint runnable via FlatCompat (#15)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Route harness + statuses proof tests (#16)

**Files:**
- Create: `test/route-harness.ts`
- Create: `app/api/statuses/[id]/route.test.ts`
- Create: `app/api/statuses/route.test.ts`

**Interfaces:**
- Produces (from `@/test/route-harness`):
  - `jsonRequest(method: string, url: string, body?: unknown): NextRequest`
  - `params(obj: Record<string, string>): { params: Promise<Record<string, string>> }`
  - `dbMock` — singleton with `select/insert/update/delete/execute` and a `configure(queues)` + `reset()`; each op consumes its per-op result queue in call order.

- [ ] **Step 1: Implement `test/route-harness.ts`**

```ts
// Hermetic route-test harness. Tests mock @/lib/db with `dbMock` and @/lib/auth's
// `auth`, then invoke the exported route handler and assert on the NextResponse.
//
// Copy-paste header for a route test file (vi.mock is hoisted above imports, so
// the factory dynamic-imports this module to share the singleton dbMock):
//
//   import { vi } from 'vitest'
//   vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
//   vi.mock('@/lib/db', async () => ({ db: (await import('@/test/route-harness')).dbMock }))
//
import { NextRequest } from 'next/server'

export function jsonRequest(method: string, url: string, body?: unknown): NextRequest {
  const init: RequestInit = { method }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  return new NextRequest(new URL(url, 'http://localhost').toString(), init)
}

export function params(obj: Record<string, string>) {
  return { params: Promise.resolve(obj) }
}

type Op = 'select' | 'insert' | 'update' | 'delete' | 'execute'
type Queues = Partial<Record<Op, unknown[]>>

// A chain object is both chainable (every builder method returns it) and
// thenable (awaiting it resolves the next queued result for the op it began as).
function makeChain(op: Op, pull: (op: Op) => unknown) {
  const chain: Record<string, unknown> = {}
  const passthrough = ['from', 'where', 'set', 'values', 'returning', 'onConflictDoNothing', 'orderBy', 'limit', 'groupBy', 'leftJoin', 'innerJoin']
  for (const m of passthrough) chain[m] = () => chain
  chain.then = (resolve: (v: unknown) => void) => resolve(pull(op))
  return chain
}

class DbMock {
  private queues: Queues = {}
  configure(queues: Queues) { this.queues = queues }
  reset() { this.queues = {} }
  private pull(op: Op): unknown {
    const q = this.queues[op]
    if (!q || q.length === 0) throw new Error(`dbMock: no queued result for '${op}'`)
    return q.shift()
  }
  select() { return makeChain('select', o => this.pull(o)) }
  insert() { return makeChain('insert', o => this.pull(o)) }
  update() { return makeChain('update', o => this.pull(o)) }
  delete() { return makeChain('delete', o => this.pull(o)) }
  execute() { return Promise.resolve(this.pull('execute')) }
}

export const dbMock = new DbMock()
```

- [ ] **Step 2: Write `app/api/statuses/[id]/route.test.ts`** (RED first — the route exists but the test file doesn't):

```ts
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { jsonRequest, params, dbMock } from '@/test/route-harness'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', async () => ({ db: (await import('@/test/route-harness')).dbMock }))

import { PATCH, DELETE } from './route'
import { auth } from '@/lib/auth'

const asAdmin = () => (auth as Mock).mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
const systemRow = { id: 's1', name: 'Sold', color: '#22c55e', sortOrder: 1, active: true, autoKey: 'customer' }
const customRow = { id: 's2', name: 'Custom', color: '#8b5cf6', sortOrder: 6, active: true, autoKey: null }

beforeEach(() => { dbMock.reset(); (auth as Mock).mockReset() })

describe('PATCH /api/statuses/[id]', () => {
  it('403 when the caller is not an admin', async () => {
    ;(auth as Mock).mockResolvedValue({ user: { id: 'r1', role: 'rep' } })
    const res = await PATCH(jsonRequest('PATCH', '/api/statuses/s1', { name: 'X' }), params({ id: 's1' }))
    expect(res.status).toBe(403)
  })

  it('404 when the row does not exist', async () => {
    asAdmin(); dbMock.configure({ select: [[]] })
    const res = await PATCH(jsonRequest('PATCH', '/api/statuses/none', { name: 'X' }), params({ id: 'none' }))
    expect(res.status).toBe(404)
  })

  it('400 when deactivating a system row via active:false', async () => {
    asAdmin(); dbMock.configure({ select: [[systemRow]] })
    const res = await PATCH(jsonRequest('PATCH', '/api/statuses/s1', { active: false }), params({ id: 's1' }))
    expect(res.status).toBe(400)
  })

  it('400 when deactivating a system row via the active:0 coercion', async () => {
    asAdmin(); dbMock.configure({ select: [[systemRow]] })
    const res = await PATCH(jsonRequest('PATCH', '/api/statuses/s1', { active: 0 }), params({ id: 's1' }))
    expect(res.status).toBe(400)
  })

  it('renames a system row (allowed)', async () => {
    asAdmin(); dbMock.configure({ select: [[systemRow]], update: [[{ ...systemRow, name: 'Sold!' }]] })
    const res = await PATCH(jsonRequest('PATCH', '/api/statuses/s1', { name: 'Sold!' }), params({ id: 's1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ name: 'Sold!' })
  })
})

describe('DELETE /api/statuses/[id]', () => {
  it('400 when deleting a system row', async () => {
    asAdmin(); dbMock.configure({ select: [[systemRow]] })
    const res = await DELETE(jsonRequest('DELETE', '/api/statuses/s1'), params({ id: 's1' }))
    expect(res.status).toBe(400)
  })

  it('204 when deleting a custom row', async () => {
    asAdmin(); dbMock.configure({ select: [[customRow]], delete: [undefined] })
    const res = await DELETE(jsonRequest('DELETE', '/api/statuses/s2'), params({ id: 's2' }))
    expect(res.status).toBe(204)
  })

  it('404 for an unknown row', async () => {
    asAdmin(); dbMock.configure({ select: [[]] })
    const res = await DELETE(jsonRequest('DELETE', '/api/statuses/none'), params({ id: 'none' }))
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 3: Run it — establishes the harness works** — `npm run test:run -- "app/api/statuses/[id]/route.test.ts"`
Expected: FAIL first if the harness has a gap (fix `test/route-harness.ts` until green), then PASS (8 tests). If `NextRequest` construction or the thenable chain misbehaves, iterate on the harness here — this task's whole point is proving it.

- [ ] **Step 4: Write `app/api/statuses/route.test.ts`** (the requireRole 403 path through withErrorHandling):

```ts
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { jsonRequest, dbMock } from '@/test/route-harness'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', async () => ({ db: (await import('@/test/route-harness')).dbMock }))

import { POST } from './route'
import { auth } from '@/lib/auth'

beforeEach(() => { dbMock.reset(); (auth as Mock).mockReset() })

describe('POST /api/statuses', () => {
  it('403 for a rep (admin-only)', async () => {
    ;(auth as Mock).mockResolvedValue({ user: { id: 'r1', role: 'rep' } })
    const res = await POST(jsonRequest('POST', '/api/statuses', { name: 'New', color: '#111111' }))
    expect(res.status).toBe(403)
  })

  it('400 when name is missing (admin)', async () => {
    ;(auth as Mock).mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    const res = await POST(jsonRequest('POST', '/api/statuses', { color: '#111111' }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 5: Run + typecheck** — `npm run test:run -- "app/api/statuses/route.test.ts" && npx tsc --noEmit`
Expected: PASS (2 tests) / clean.

- [ ] **Step 6: Commit**

```bash
git add test/route-harness.ts "app/api/statuses/[id]/route.test.ts" "app/api/statuses/route.test.ts"
git commit -m "test: mock-based route harness with statuses guard coverage (#16)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Neighborhoods guard tests + docs + gates (#16)

**Files:**
- Create: `app/api/neighborhoods/[id]/route.test.ts`
- Create: `test/README.md`

**Interfaces:**
- Consumes: `jsonRequest`, `params`, `dbMock` from `@/test/route-harness` (Task 2).

- [ ] **Step 1: Read the route first** — open `app/api/neighborhoods/[id]/route.ts` and note: the PATCH order is `requireRole('admin','manager')` → `db.select({teamId}).from(neighborhoods).where(...)` (→ `[existing]`, 404 if none) → admin-field gate (403 for managers on name/city/teamId/boundary) → assignment-field gate (`canManageTeam`) → `assignedUserId` validation (uuid + `db.select({role,teamId}).from(users)` → must be a rep, team-matched for managers). Match the test's queued `select` results to that await order.

- [ ] **Step 2: Write `app/api/neighborhoods/[id]/route.test.ts`** — assert on status codes (durable across message wording):

```ts
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { jsonRequest, params, dbMock } from '@/test/route-harness'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', async () => ({ db: (await import('@/test/route-harness')).dbMock }))

import { PATCH } from './route'
import { auth } from '@/lib/auth'

beforeEach(() => { dbMock.reset(); (auth as Mock).mockReset() })

describe('PATCH /api/neighborhoods/[id]', () => {
  it('403 when the caller is a rep', async () => {
    ;(auth as Mock).mockResolvedValue({ user: { id: 'r1', role: 'rep', teamId: 't1' } })
    const res = await PATCH(jsonRequest('PATCH', '/api/neighborhoods/n1', { territoryStatus: 'active' }), params({ id: 'n1' }))
    expect(res.status).toBe(403)
  })

  it('404 when the neighborhood does not exist', async () => {
    ;(auth as Mock).mockResolvedValue({ user: { id: 'a1', role: 'admin', teamId: null } })
    dbMock.configure({ select: [[]] })
    const res = await PATCH(jsonRequest('PATCH', '/api/neighborhoods/none', { territoryStatus: 'active' }), params({ id: 'none' }))
    expect(res.status).toBe(404)
  })

  it('403 when a manager sends an admin-only field', async () => {
    ;(auth as Mock).mockResolvedValue({ user: { id: 'm1', role: 'manager', teamId: 't1' } })
    dbMock.configure({ select: [[{ teamId: 't1' }]] })
    const res = await PATCH(jsonRequest('PATCH', '/api/neighborhoods/n1', { name: 'Renamed' }), params({ id: 'n1' }))
    expect(res.status).toBe(403)
  })

  it('400 when assignedUserId points at a non-rep', async () => {
    ;(auth as Mock).mockResolvedValue({ user: { id: 'a1', role: 'admin', teamId: null } })
    // 1st select: the neighborhood row; 2nd select: the assignee lookup (a manager, not a rep)
    dbMock.configure({ select: [[{ teamId: 't1' }], [{ role: 'manager', teamId: 't1' }]] })
    const res = await PATCH(
      jsonRequest('PATCH', '/api/neighborhoods/n1', { assignedUserId: '11111111-1111-1111-1111-111111111111' }),
      params({ id: 'n1' }),
    )
    expect(res.status).toBe(400)
  })
})
```

Note: if reading the route shows a different select count/order, adjust the queued `select` array to match — the harness consumes them in await order. If a test can't be made to fit the harness cleanly, report it as a harness gap rather than forcing it.

- [ ] **Step 3: Run + typecheck** — `npm run test:run -- "app/api/neighborhoods/[id]/route.test.ts" && npx tsc --noEmit`
Expected: PASS (4 tests) / clean.

- [ ] **Step 4: Write `test/README.md`**:

```markdown
# Route tests

Edge API route handlers are tested by mocking `@/lib/auth` and `@/lib/db`,
invoking the exported handler, and asserting on the returned `NextResponse`.
This covers guard/validation logic (roles, ownership, status codes, field
rules) — NOT SQL correctness (the pure helpers are unit-tested separately;
real queries are exercised by post-deploy smoke).

## Writing a route test

Header (the `@/lib/db` factory dynamic-imports the harness so the singleton
`dbMock` is shared between the mock and your test body):

    import { vi } from 'vitest'
    vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
    vi.mock('@/lib/db', async () => ({ db: (await import('@/test/route-harness')).dbMock }))

Then import the handler + `auth`, and in each test:

    ;(auth as Mock).mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    dbMock.configure({ select: [[existingRow]], update: [[updatedRow]] })
    const res = await PATCH(jsonRequest('PATCH', '/api/x/1', { … }), params({ id: '1' }))
    expect(res.status).toBe(200)

`dbMock.configure({ op: [result, …] })` queues results per drizzle op
(`select`/`insert`/`update`/`delete`/`execute`), consumed in await order.
Reset with `dbMock.reset()` in `beforeEach`. See
`app/api/statuses/[id]/route.test.ts` for a full example.
```

- [ ] **Step 5: Full gates** — from the worktree root:

```bash
npx tsc --noEmit && npm run test:run && npm run lint && AUTH_GOOGLE_ID=dummy AUTH_GOOGLE_SECRET=dummy AUTH_SECRET=dummy DATABASE_URL='postgresql://dummy:dummy@localhost:5432/dummy' npm run build
```

Expected: tsc clean; suite passes (new route tests green; note `lib/auth.test.ts` state without chasing it); **`npm run lint` exits 0**; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add "app/api/neighborhoods/[id]/route.test.ts" test/README.md
git commit -m "test: neighborhoods guard coverage and route-test docs (#16)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** FlatCompat lint fix + surfaced-violation decision rule (T1); mock harness with request/params/chainable-db + the documented vi.mock hoisting pattern + statuses[id] system-row/404/rename guards + statuses POST 403 (T2); neighborhoods[id] role/field/assignee guards + README + the new `npm run lint` gate wired into the full gate run (T3). Out-of-scope items (real SQL, blanket coverage, CI lint wiring, `lib/auth.test.ts`) have no tasks.
- **Type/name consistency:** `jsonRequest`, `params`, `dbMock` (+ `.configure`/`.reset`) defined in T2 and consumed identically in T3 and the README; per-op queue keys `select|insert|update|delete|execute` consistent across harness and every test.
- **Known implementation unknown (flagged in spec):** the vi.mock-hoisting + shared-`dbMock`-singleton pattern via async dynamic-import in the factory is the pattern vitest supports; if it misbehaves, T2 Step 3 is where it's proven/iterated before any dependent tests are written. The chainable-thenable db mock is the other fiddly piece — also shaken out in T2 Step 3.
- **Durability choice:** route tests assert HTTP status codes, not error-message strings (except the statuses rename body check where the field value is stable), so refactors of message wording don't break the guard tests.
