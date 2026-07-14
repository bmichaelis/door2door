# Territories: show zero-house neighborhoods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `/territories` show and assign neighborhoods that have zero houses, without bloating the map's payload.

**Architecture:** Extract the neighborhoods-list SQL into a pure `neighborhoodsListQuery(includeEmpty)` builder whose `HAVING COUNT(h.id) > 0` clause is conditional. `GET /api/neighborhoods` reads an `includeEmpty` query param (default off, so the map is unchanged); the territories page requests `?includeEmpty=1`.

**Tech Stack:** Next.js edge route handlers, drizzle-orm `sql`, vitest + Testing Library, the `test/route-harness.ts` mock harness (#16).

## Global Constraints

- The map (`components/map/MapShell.tsx`) must be unchanged — its default `GET /api/neighborhoods` call (no param) must still apply `HAVING COUNT(h.id) > 0`.
- Response shape is identical in both modes; only the presence of empty rows (with `houseCount: 0`) differs. No client shape changes beyond the request URL.
- `GET` keeps its `requireRole('admin', 'manager', 'rep')` gate.
- No new dependencies. Keep `runtime = 'edge'`.
- Query columns, `ST_SimplifyPreserveTopology(n.boundary, 0.0001)`, `GROUP BY n.id, u.name`, and `ORDER BY n.name` stay exactly as they are today.

---

### Task 1: `neighborhoodsListQuery` builder + GET reads `includeEmpty`

**Files:**
- Create: `app/api/neighborhoods/query.ts`
- Test: `app/api/neighborhoods/query.test.ts`
- Modify: `app/api/neighborhoods/route.ts` (GET handler)
- Test: `app/api/neighborhoods/route.test.ts`

**Interfaces:**
- Produces: `function neighborhoodsListQuery(includeEmpty: boolean): SQL` — the full list SELECT; omits the `HAVING` when `includeEmpty` is true.

- [ ] **Step 1: Write the failing query-builder test**

Create `app/api/neighborhoods/query.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { neighborhoodsListQuery } from './query'

const render = (includeEmpty: boolean) =>
  new PgDialect().sqlToQuery(neighborhoodsListQuery(includeEmpty)).sql.toLowerCase()

describe('neighborhoodsListQuery', () => {
  it('filters zero-house neighborhoods by default (HAVING present)', () => {
    expect(render(false)).toContain('having')
  })

  it('omits the HAVING when includeEmpty is true', () => {
    expect(render(true)).not.toContain('having')
  })

  it('keeps the same columns and grouping in both modes', () => {
    for (const mode of [false, true]) {
      const q = render(mode)
      expect(q).toContain('"housecount"')
      expect(q).toContain('group by n.id, u.name')
      expect(q).toContain('order by n.name')
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- app/api/neighborhoods/query.test.ts`
Expected: FAIL — cannot resolve `./query`.

- [ ] **Step 3: Create the query builder**

Create `app/api/neighborhoods/query.ts`:

```ts
import { sql, type SQL } from 'drizzle-orm'

/**
 * The neighborhoods list query. By default filters out neighborhoods with zero
 * houses (`HAVING COUNT(h.id) > 0`) to keep the map payload lean — boundaries
 * are also simplified server-side (0.0001° ≈ 10m), shrinking ~1428 polygons
 * from ~6 MB to ~1 MB. Pass `includeEmpty` to return all neighborhoods; the
 * /territories management page needs empty ones so they can be assigned.
 */
export function neighborhoodsListQuery(includeEmpty: boolean): SQL {
  const having = includeEmpty ? sql`` : sql`HAVING COUNT(h.id) > 0`
  return sql`
    SELECT n.id, n.name, n.team_id, n.created_at,
      n.assigned_user_id as "assignedUserId",
      n.territory_status as "territoryStatus",
      u.name as "assignedUserName",
      ST_AsGeoJSON(ST_SimplifyPreserveTopology(n.boundary, 0.0001))::json as boundary,
      COUNT(h.id)::int as "houseCount"
    FROM neighborhoods n
    LEFT JOIN users u ON u.id = n.assigned_user_id
    LEFT JOIN houses h ON h.neighborhood_id = n.id
    GROUP BY n.id, u.name
    ${having}
    ORDER BY n.name`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- app/api/neighborhoods/query.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the GET handler to the builder + the param**

In `app/api/neighborhoods/route.ts`, replace the `GET` handler (the `export const GET = ...` block, lines 9–29) with:

```ts
export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const raw = new URL(req.url).searchParams.get('includeEmpty')
  const includeEmpty = raw !== null && raw !== '0' && raw !== 'false'
  const rows = await db.execute(neighborhoodsListQuery(includeEmpty))
  return NextResponse.json(rows.rows)
})
```

Add the import near the top (after the existing imports):

```ts
import { neighborhoodsListQuery } from './query'
```

Leave the `POST` handler untouched. `NextRequest` is already imported.

- [ ] **Step 6: Write the route-handler guard test**

Create `app/api/neighborhoods/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { jsonRequest, dbMock } from '@/test/route-harness'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', async () => ({ db: (await import('@/test/route-harness')).dbMock }))

import { GET } from './route'
import { auth } from '@/lib/auth'

beforeEach(() => { dbMock.reset(); (auth as Mock).mockReset() })

describe('GET /api/neighborhoods', () => {
  it('returns the executed rows for an authenticated rep', async () => {
    ;(auth as Mock).mockResolvedValue({ user: { id: 'r1', role: 'rep', teamId: 't1' } })
    dbMock.configure({ execute: [{ rows: [{ id: 'n1', houseCount: 0 }] }] })
    const res = await GET(jsonRequest('GET', '/api/neighborhoods?includeEmpty=1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: 'n1', houseCount: 0 }])
  })

  it('403 when there is no session', async () => {
    ;(auth as Mock).mockResolvedValue(null)
    const res = await GET(jsonRequest('GET', '/api/neighborhoods'))
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 7: Run the route test + typecheck**

Run: `npm run test:run -- app/api/neighborhoods/route.test.ts`
Expected: PASS (2 tests).
Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add app/api/neighborhoods/query.ts app/api/neighborhoods/query.test.ts app/api/neighborhoods/route.ts app/api/neighborhoods/route.test.ts
git commit -m "feat: GET /api/neighborhoods supports ?includeEmpty=1 (#23)"
```

---

### Task 2: Territories page requests empty neighborhoods

**Files:**
- Modify: `app/(app)/territories/client.tsx` (the list-load `fetch`, ~line 47)
- Test: `app/(app)/territories/client.test.tsx`

**Interfaces:**
- Consumes: the `includeEmpty` query param added to `GET /api/neighborhoods` in Task 1.

- [ ] **Step 1: Write the failing assertion that the page opts in**

Add this test to `app/(app)/territories/client.test.tsx`, inside the top-level `describe` block that renders `TerritoriesClient` (the file already stubs `fetch` in `beforeEach` and imports `render`, `screen`, `TerritoriesClient`):

```ts
  it('requests neighborhoods including empty ones', async () => {
    render(<TerritoriesClient currentUser={{ id: 'a1', role: 'admin', teamId: null }} />)
    await screen.findByText('Provo 01')
    expect(fetch).toHaveBeenCalledWith('/api/neighborhoods?includeEmpty=1')
  })
```

If the file has no import for `TerritoriesClient`/`render`/`screen`, mirror the imports already used by the other rendering tests in that file (e.g. the "shows an error banner" test). Do not add a new `fetch` stub — the `beforeEach` one returns `NEIGHBORHOODS` for any non-`/api/users`, non-PATCH request, so it already serves this call.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- "app/(app)/territories/client.test.tsx" -t "requests neighborhoods including empty"`
Expected: FAIL — `fetch` was called with `'/api/neighborhoods'`, not `'/api/neighborhoods?includeEmpty=1'`.

- [ ] **Step 3: Update the client fetch**

In `app/(app)/territories/client.tsx`, change the neighborhoods fetch (currently `fetch('/api/neighborhoods').then(...)`) to:

```ts
      fetch('/api/neighborhoods?includeEmpty=1').then(r => r.ok ? r.json() : Promise.reject(new Error('load failed'))),
```

Leave the `/api/users` fetch and everything else unchanged.

- [ ] **Step 4: Run the territories tests + typecheck/lint**

Run: `npm run test:run -- "app/(app)/territories/client.test.tsx"`
Expected: PASS (all tests in the file, including the new one).
Run: `npx tsc --noEmit` (clean) and `npm run lint` (exits 0).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/territories/client.tsx" "app/(app)/territories/client.test.tsx"
git commit -m "feat: territories page shows zero-house neighborhoods (#23)"
```

---

## Notes for the executor

- The whole suite has one known-unrelated env failure (`lib/auth.test.ts`) present on `main` — ignore it; run the focused files named above.
- Do not touch `components/map/MapShell.tsx` or `app/(app)/admin/neighborhoods/*` — the map must keep its lean default, and admin already lists empties via its own server-side query.
- SQL correctness of the toggle is covered hermetically by `query.test.ts` (rendered via `PgDialect`); the route harness mocks the DB, so it verifies the handler wiring/role gate, not the `HAVING` semantics. No Neon-branch verification is required for this change.
