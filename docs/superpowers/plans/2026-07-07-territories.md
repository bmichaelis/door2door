# Territory Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-rep neighborhood assignment with an upcoming/active/completed lifecycle: two columns on `neighborhoods`, manager-accessible PATCH, a `/territories` management page, and status-aware map tinting.

**Architecture:** Columns not a join table (v1; history is additive later). `PATCH /api/neighborhoods/[id]` splits field permissions: existing fields stay admin-only, assignment fields open to admin or the neighborhood's team manager via `canManageTeam`. `TerritoriesClient` fetches the two existing list APIs; `NeighborhoodLayer` gets data-driven fill expressions.

**Tech Stack:** Next.js 15 edge, Neon + drizzle, React 19, react-map-gl, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-07-territories-design.md`

## Global Constraints

- Code style: no semicolons, single quotes, 2-space indent.
- Migration journal `when` MUST be `1783437652444` (exceeds 0012's `1783435612577`).
- `territoryStatus` values exactly `upcoming | active | completed` or null (400 otherwise). Colors: mine+active `#3b82f6`@0.25, mine+upcoming `#8b5cf6`@0.18, completed `#9ca3af`@0.05, default `#3b82f6`@0.1.
- Gates: `npx tsc --noEmit`, `npm run test:run` (single env-only `lib/auth.test.ts` failure expected), `next build`. NO `npm run lint` (issue #15).
- Commits reference `#6`. Migration apply: copy `/home/ubuntu/repos/door2door/.env.local` into the worktree, then `node --env-file=.env.local /home/ubuntu/repos/door2door/node_modules/.bin/drizzle-kit migrate`.

---

### Task 1: Schema columns, migration 0013, API changes

**Files:**
- Modify: `lib/db/schema.ts` (neighborhoods table)
- Modify: `lib/db/schema.test.ts`
- Create: `lib/db/migrations/0013_territories.sql`
- Modify: `lib/db/migrations/meta/_journal.json`
- Modify: `app/api/neighborhoods/route.ts` (GET select)
- Modify: `app/api/neighborhoods/[id]/route.ts` (PATCH permissions + fields)

**Interfaces:**
- Produces: `neighborhoods.assignedUserId` / `neighborhoods.territoryStatus` columns (Drizzle names `assigned_user_id`, `territory_status`); GET rows gain `assignedUserId`, `territoryStatus`, `assignedUserName`; PATCH accepts `assignedUserId` (uuid|null) + `territoryStatus` (enum|null) for admin or the team's manager.

- [ ] **Step 1: Failing schema test** — add to `lib/db/schema.test.ts` (inside the describe):

```ts
  it('neighborhoods have territory assignment columns', () => {
    expect((neighborhoods.assignedUserId as { name: string }).name).toBe('assigned_user_id')
    expect((neighborhoods.territoryStatus as { name: string }).name).toBe('territory_status')
  })
```

- [ ] **Step 2: RED** — `npm run test:run -- lib/db/schema.test.ts` — FAIL.

- [ ] **Step 3: Schema** — in the `neighborhoods` table in `lib/db/schema.ts`, add after `boundary`:

```ts
  assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  territoryStatus: text('territory_status', { enum: ['upcoming', 'active', 'completed'] }),
```

(If `users` is declared after `neighborhoods` in the file, use the same lazy-reference form the file already uses elsewhere — check before editing; `neighborhoods` currently references `teams` the same way.)

- [ ] **Step 4: GREEN** — `npm run test:run -- lib/db/schema.test.ts` — PASS.

- [ ] **Step 5: Migration** — create `lib/db/migrations/0013_territories.sql`:

```sql
ALTER TABLE "neighborhoods" ADD COLUMN IF NOT EXISTS "assigned_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "neighborhoods" ADD COLUMN IF NOT EXISTS "territory_status" text;

CREATE INDEX IF NOT EXISTS "neighborhoods_assigned_user_idx" ON "neighborhoods" ("assigned_user_id");
```

- [ ] **Step 6: Journal** — append after idx 12:

```json
    {
      "idx": 13,
      "version": "7",
      "when": 1783437652444,
      "tag": "0013_territories",
      "breakpoints": true
    }
```

- [ ] **Step 7: Apply** — per Global Constraints; skip + note if env missing.

- [ ] **Step 8: GET select** — in `app/api/neighborhoods/route.ts`, replace the GET query with:

```ts
  const rows = await db.execute(
    sql`SELECT n.id, n.name, n.team_id, n.created_at,
        n.assigned_user_id as "assignedUserId",
        n.territory_status as "territoryStatus",
        u.name as "assignedUserName",
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(n.boundary, 0.0001))::json as boundary,
        COUNT(h.id)::int as "houseCount"
        FROM neighborhoods n
        LEFT JOIN users u ON u.id = n.assigned_user_id
        LEFT JOIN houses h ON h.neighborhood_id = n.id
        GROUP BY n.id, u.name
        HAVING COUNT(h.id) > 0
        ORDER BY n.name`
  )
```

(Keep the existing comment about boundary simplification above it.)

- [ ] **Step 9: PATCH permissions + fields** — rewrite the PATCH handler in `app/api/neighborhoods/[id]/route.ts` as:

```ts
export const PATCH = withErrorHandling(async (req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager')
  const { id } = await params
  const body = await req.json()
  const role = session!.user!.role

  const [existing] = await db.select({ teamId: neighborhoods.teamId }).from(neighborhoods).where(eq(neighborhoods.id, id))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Pre-existing fields stay admin-only
  const hasAdminFields = body.name !== undefined || body.city !== undefined || body.teamId !== undefined || body.boundary !== undefined
  if (hasAdminFields && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Assignment fields: admin, or the manager of this neighborhood's team
  const hasAssignmentFields = 'assignedUserId' in body || 'territoryStatus' in body
  if (hasAssignmentFields && role !== 'admin' &&
      !canManageTeam({ role: role!, teamId: session!.user!.teamId ?? null }, existing.teamId ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const scalarUpdates: Partial<typeof neighborhoods.$inferInsert> = {}
  if (body.name !== undefined) scalarUpdates.name = body.name
  if (body.city !== undefined) scalarUpdates.city = body.city ?? null
  if (body.teamId !== undefined) scalarUpdates.teamId = body.teamId ?? null
  if ('assignedUserId' in body) scalarUpdates.assignedUserId = body.assignedUserId
  if ('territoryStatus' in body) {
    if (body.territoryStatus !== null && !['upcoming', 'active', 'completed'].includes(body.territoryStatus)) {
      return NextResponse.json({ error: 'territoryStatus must be upcoming, active, completed, or null' }, { status: 400 })
    }
    scalarUpdates.territoryStatus = body.territoryStatus
  }

  if (Object.keys(scalarUpdates).length > 0) {
    await db.update(neighborhoods).set(scalarUpdates).where(eq(neighborhoods.id, id))
  }

  // Update geometry separately with parameterized sql (no string interpolation)
  if (body.boundary) {
    const geojson = JSON.stringify(
      body.boundary.type === 'Feature' ? body.boundary.geometry : body.boundary
    )
    await db.execute(
      sql`UPDATE neighborhoods SET boundary = ST_GeomFromGeoJSON(${geojson}) WHERE id = ${id}`
    )
  }

  const rows = await db.execute(
    sql`SELECT id, name, team_id, created_at,
        assigned_user_id as "assignedUserId",
        territory_status as "territoryStatus",
        ST_AsGeoJSON(boundary)::json as boundary
        FROM neighborhoods WHERE id = ${id}`
  )
  return NextResponse.json(rows.rows[0])
})
```

Add `canManageTeam` to the permissions import in that file. Keep the DELETE handler (if present) and everything else untouched.

- [ ] **Step 10: Verify** — `npx tsc --noEmit && npm run test:run` — clean / pass.

- [ ] **Step 11: Commit**

```bash
git add lib/db app/api/neighborhoods
git commit -m "feat: territory assignment columns and manager-accessible PATCH (#6)"
```

---

### Task 2: `/territories` page + `TerritoriesClient` (TDD) + nav

**Files:**
- Create: `app/(app)/territories/page.tsx`
- Create: `app/(app)/territories/client.tsx`
- Create: `app/(app)/territories/client.test.tsx`
- Modify: `app/(app)/nav-bar.tsx`

**Interfaces:**
- Consumes: `GET /api/neighborhoods` (Task 1 shape), `GET /api/users`, `PATCH /api/neighborhoods/[id]`.
- Produces: `TerritoriesClient` props `{ currentUser: { id: string; role: string; teamId: string | null } }`; exported pure helper `repOptionsFor(neighborhood: { teamId: string | null }, users: UserRow[], role: string): UserRow[]`; `type UserRow = { id: string; name: string | null; role: string | null; teamId: string | null }`.

- [ ] **Step 1: Failing tests** — create `app/(app)/territories/client.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TerritoriesClient, repOptionsFor, type UserRow } from './client'

const USERS: UserRow[] = [
  { id: 'r1', name: 'Rita Rep', role: 'rep', teamId: 't1' },
  { id: 'r2', name: 'Ray Rep', role: 'rep', teamId: 't2' },
  { id: 'm1', name: 'Mo Manager', role: 'manager', teamId: 't1' },
]

const NEIGHBORHOODS = [
  { id: 'n1', name: 'Provo 01', team_id: 't1', teamId: 't1', houseCount: 120, assignedUserId: null, territoryStatus: null, assignedUserName: null },
  { id: 'n2', name: 'Provo 02', team_id: 't2', teamId: 't2', houseCount: 80, assignedUserId: 'r2', territoryStatus: 'active', assignedUserName: 'Ray Rep' },
]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') return Promise.resolve({ ok: true, json: async () => ({}) })
    if (url === '/api/users') return Promise.resolve({ ok: true, json: async () => USERS })
    return Promise.resolve({ ok: true, json: async () => NEIGHBORHOODS })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('repOptionsFor', () => {
  it('managers see only reps on the neighborhood team', () => {
    expect(repOptionsFor({ teamId: 't1' }, USERS, 'manager').map(u => u.id)).toEqual(['r1'])
  })

  it('admins see all reps', () => {
    expect(repOptionsFor({ teamId: 't1' }, USERS, 'admin').map(u => u.id)).toEqual(['r1', 'r2'])
  })

  it('non-reps are never options', () => {
    expect(repOptionsFor({ teamId: 't1' }, USERS, 'admin').some(u => u.id === 'm1')).toBe(false)
  })
})

describe('TerritoriesClient', () => {
  it('admin sees all neighborhoods', async () => {
    render(<TerritoriesClient currentUser={{ id: 'a1', role: 'admin', teamId: null }} />)
    expect(await screen.findByText('Provo 01')).toBeInTheDocument()
    expect(screen.getByText('Provo 02')).toBeInTheDocument()
  })

  it('manager sees only their team', async () => {
    render(<TerritoriesClient currentUser={{ id: 'm1', role: 'manager', teamId: 't1' }} />)
    expect(await screen.findByText('Provo 01')).toBeInTheDocument()
    expect(screen.queryByText('Provo 02')).not.toBeInTheDocument()
  })

  it('changing the assignee PATCHes the neighborhood', async () => {
    const user = userEvent.setup()
    render(<TerritoriesClient currentUser={{ id: 'a1', role: 'admin', teamId: null }} />)
    await screen.findByText('Provo 01')
    await user.selectOptions(screen.getByLabelText('Assignee for Provo 01'), 'r1')
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/neighborhoods/n1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ assignedUserId: 'r1' }),
      }))
    })
  })

  it('changing the status PATCHes the neighborhood', async () => {
    const user = userEvent.setup()
    render(<TerritoriesClient currentUser={{ id: 'a1', role: 'admin', teamId: null }} />)
    await screen.findByText('Provo 01')
    await user.selectOptions(screen.getByLabelText('Status for Provo 01'), 'active')
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/neighborhoods/n1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ territoryStatus: 'active' }),
      }))
    })
  })

  it('shows an error banner when a PATCH fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return Promise.resolve({ ok: false, json: async () => ({ error: 'Forbidden' }) })
      if (url === '/api/users') return Promise.resolve({ ok: true, json: async () => USERS })
      return Promise.resolve({ ok: true, json: async () => NEIGHBORHOODS })
    }))
    const user = userEvent.setup()
    render(<TerritoriesClient currentUser={{ id: 'a1', role: 'admin', teamId: null }} />)
    await screen.findByText('Provo 01')
    await user.selectOptions(screen.getByLabelText('Status for Provo 01'), 'active')
    expect(await screen.findByText('Forbidden')).toBeInTheDocument()
  })

  it('shows the empty state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url === '/api/users') return Promise.resolve({ ok: true, json: async () => USERS })
      return Promise.resolve({ ok: true, json: async () => [] })
    }))
    render(<TerritoriesClient currentUser={{ id: 'a1', role: 'admin', teamId: null }} />)
    expect(await screen.findByText('No neighborhoods yet.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: RED** — `npm run test:run -- "app/(app)/territories/client.test.tsx"` — FAIL.

- [ ] **Step 3: Implement `app/(app)/territories/client.tsx`**:

```tsx
'use client'
import { useState, useEffect } from 'react'

export type UserRow = { id: string; name: string | null; role: string | null; teamId: string | null }

type NeighborhoodRow = {
  id: string
  name: string
  teamId: string | null
  team_id?: string | null
  houseCount: number
  assignedUserId: string | null
  territoryStatus: string | null
  assignedUserName: string | null
}

const STATUS_OPTIONS = [
  { value: '', label: '—' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
]

export function repOptionsFor(
  neighborhood: { teamId: string | null },
  users: UserRow[],
  role: string,
): UserRow[] {
  const reps = users.filter(u => u.role === 'rep')
  if (role === 'admin') return reps
  return reps.filter(u => u.teamId === neighborhood.teamId)
}

type Props = {
  currentUser: { id: string; role: string; teamId: string | null }
}

export function TerritoriesClient({ currentUser }: Props) {
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodRow[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/neighborhoods').then(r => r.ok ? r.json() : Promise.reject(new Error('load failed'))),
      fetch('/api/users').then(r => r.ok ? r.json() : Promise.reject(new Error('load failed'))),
    ])
      .then(([nbhds, us]: [NeighborhoodRow[], UserRow[]]) => {
        // GET /api/neighborhoods returns team_id (snake_case); normalize once
        setNeighborhoods(nbhds.map(n => ({ ...n, teamId: n.teamId ?? n.team_id ?? null })))
        setUsers(us)
      })
      .catch(() => setError('Failed to load territories.'))
      .finally(() => setLoading(false))
  }, [])

  const visible = currentUser.role === 'manager'
    ? neighborhoods.filter(n => n.teamId === currentUser.teamId)
    : neighborhoods

  async function patch(n: NeighborhoodRow, field: 'assignedUserId' | 'territoryStatus', value: string | null) {
    setError(null)
    setBusyId(n.id)
    try {
      const res = await fetch(`/api/neighborhoods/${n.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Update failed')
      }
      setNeighborhoods(prev => prev.map(row => {
        if (row.id !== n.id) return row
        const next = { ...row, [field]: value }
        if (field === 'assignedUserId') {
          next.assignedUserName = users.find(u => u.id === value)?.name ?? null
        }
        return next
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No neighborhoods yet.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map(n => (
            <li key={n.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{n.name}</p>
                <p className="text-xs text-muted-foreground">{n.houseCount} homes</p>
              </div>
              <select
                aria-label={`Assignee for ${n.name}`}
                disabled={busyId === n.id}
                value={n.assignedUserId ?? ''}
                onChange={e => patch(n, 'assignedUserId', e.target.value || null)}
                className="rounded-lg border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">Unassigned</option>
                {repOptionsFor(n, users, currentUser.role).map(u => (
                  <option key={u.id} value={u.id}>{u.name ?? 'Unknown'}</option>
                ))}
              </select>
              <select
                aria-label={`Status for ${n.name}`}
                disabled={busyId === n.id}
                value={n.territoryStatus ?? ''}
                onChange={e => patch(n, 'territoryStatus', e.target.value || null)}
                className="rounded-lg border bg-background px-2 py-1.5 text-sm"
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: GREEN** — `npm run test:run -- "app/(app)/territories/client.test.tsx"` — PASS (9 tests).

- [ ] **Step 5: Page** — create `app/(app)/territories/page.tsx`:

```tsx
export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { TerritoriesClient } from './client'

export default async function TerritoriesPage() {
  const session = await auth()
  const role = session?.user?.role
  if (!role) redirect('/waiting')
  if (role !== 'admin' && role !== 'manager') redirect('/map')

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold mb-1">Territories</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Assign neighborhoods to reps and track their lifecycle. Assigned reps
        see their territories highlighted on the map.
      </p>
      <TerritoriesClient currentUser={{ id: session.user.id, role, teamId: session.user.teamId ?? null }} />
    </div>
  )
}
```

- [ ] **Step 6: Nav** — in `app/(app)/nav-bar.tsx`, after the Appointments navLink add:

```tsx
        {(role === 'admin' || role === 'manager') && navLink('/territories', 'Territories')}
```

- [ ] **Step 7: Verify** — `npx tsc --noEmit && npm run test:run` — clean / pass.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/territories" "app/(app)/nav-bar.tsx"
git commit -m "feat: territories page with assignee and lifecycle controls (#6)"
```

---

### Task 3: Map tinting + gates

**Files:**
- Modify: `components/map/NeighborhoodLayer.tsx`
- Modify: `components/map/MapView.tsx`
- Modify: `components/map/MapShell.tsx`

**Interfaces:**
- Consumes: `assignedUserId`/`territoryStatus` on the neighborhoods GET rows (Task 1); `currentUser` already in `MapShell`.
- Produces: `NeighborhoodLayer` props gain `currentUserId: string`; `MapView` props gain `currentUserId: string`.

- [ ] **Step 1: `NeighborhoodLayer.tsx`** — extend the neighborhood type and props, thread properties, and make the fill data-driven:

```tsx
'use client'
import { Source, Layer } from 'react-map-gl/mapbox'
import type { Neighborhood } from '@/lib/db/schema'

type Props = {
  neighborhoods: (Neighborhood & { boundary: GeoJSON.Polygon; houseCount: number })[]
  currentUserId: string
}

export function NeighborhoodLayer({ neighborhoods, currentUserId }: Props) {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: neighborhoods
      .filter(n => n.boundary)
      .map(n => ({
        type: 'Feature',
        id: n.id,
        geometry: n.boundary,
        properties: {
          name: n.name,
          id: n.id,
          houseCount: n.houseCount ?? 0,
          assignedUserId: n.assignedUserId ?? '',
          territoryStatus: n.territoryStatus ?? '',
        },
      })),
  }

  const mineActive = ['all', ['==', ['get', 'assignedUserId'], currentUserId], ['==', ['get', 'territoryStatus'], 'active']]
  const mineUpcoming = ['all', ['==', ['get', 'assignedUserId'], currentUserId], ['==', ['get', 'territoryStatus'], 'upcoming']]
  const completed = ['==', ['get', 'territoryStatus'], 'completed']

  return (
    <Source id="neighborhoods" type="geojson" data={geojson}>
      <Layer
        id="neighborhood-fill"
        type="fill"
        paint={{
          'fill-color': ['case', mineActive, '#3b82f6', mineUpcoming, '#8b5cf6', completed, '#9ca3af', '#3b82f6'] as never,
          'fill-opacity': ['case', mineActive, 0.25, mineUpcoming, 0.18, completed, 0.05, 0.1] as never,
        }}
      />
      <Layer
        id="neighborhood-outline"
        type="line"
        paint={{ 'line-color': '#3b82f6', 'line-width': 2 }}
      />
      <Layer
        id="neighborhood-labels"
        maxzoom={14}
        type="symbol"
        layout={{
          'text-field': ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'houseCount']], ' homes'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
          'text-anchor': 'center',
        }}
        paint={{
          'text-color': '#1e40af',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        }}
      />
    </Source>
  )
}
```

(If `as never` displeases tsc for the mixed expression arrays, type the case arrays as `unknown as import('mapbox-gl').Expression` — pick whichever compiles cleanly; the repo precedent for data-driven paint is `['get', 'color']` in HousePins, which needed no cast, so try without casts first.)

- [ ] **Step 2: `MapView.tsx`** — add `currentUserId: string` to Props and destructuring; pass `currentUserId={currentUserId}` to `<NeighborhoodLayer ... />`.

- [ ] **Step 3: `MapShell.tsx`** — pass `currentUserId={currentUser.id}` to `<MapView ... />`.

- [ ] **Step 4: Full gates** — `npx tsc --noEmit && npm run test:run && AUTH_GOOGLE_ID=dummy AUTH_GOOGLE_SECRET=dummy AUTH_SECRET=dummy DATABASE_URL='postgresql://dummy:dummy@localhost:5432/dummy' npm run build` — clean / pass / build lists `/territories`.

- [ ] **Step 5: Commit**

```bash
git add components/map
git commit -m "feat: territory-aware neighborhood tinting on the map (#6)"
```

---

## Self-Review Notes

- **Spec coverage:** columns+index+migration (T1 steps 3-7), GET/PATCH changes incl. split permissions and status validation (T1 steps 8-9), page+client+helper+nav with 9 tests (T2), map tint expressions + prop threading (T3). Out-of-scope items have no tasks.
- **Type consistency:** `UserRow` and props shapes consistent across helper/client/page; snake_case `team_id` from the GET normalized once in the client (the GET selects `n.team_id` unaliased — normalization is required, and the test fixtures carry both keys to pin it).
- **Known risk flagged in T3:** mapbox expression typing may need a cast; both options given.
