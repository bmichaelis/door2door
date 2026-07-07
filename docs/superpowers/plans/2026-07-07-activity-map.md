# Activity Map (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A manager/admin-only "Activity" map layer showing today's visits (houses + businesses) as rep-colored dots with a legend. No GPS, no migration.

**Architecture:** One role-gated UNION query over existing visit tables; a pure `repPalette` helper; a presentational circle layer; toggle + legend wired in `MapShell` (hidden for reps).

**Tech Stack:** Next.js 15 edge, Neon + drizzle sql, React 19, react-map-gl, vitest.

**Spec:** `docs/superpowers/specs/2026-07-07-activity-map-design.md`

## Global Constraints

- Code style: no semicolons, single quotes, 2-space indent.
- `at` MUST be selected as `to_char(x.created_at, 'YYYY-MM-DD"T"HH24:MI:SS')` (zone-less — the appointments-branch timezone lesson).
- Palette exactly: `['#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#6366f1']`.
- Activity layer renders BEFORE (beneath) HousePins/BusinessPins in MapView's children.
- Gates: `npx tsc --noEmit`, `npm run test:run` (single env-only `lib/auth.test.ts` failure expected), `next build`. NO lint (issue #15).
- Commits reference `#8`.

---

### Task 1: API route + `lib/activity.ts` (TDD for `repPalette`)

**Files:**
- Create: `app/api/activity/route.ts`
- Create: `lib/activity.ts`
- Create: `lib/activity.test.ts`

**Interfaces:**
- Produces: `type ActivityPoint = { userId: string; repName: string | null; lat: number; lng: number; at: string }`, `ACTIVITY_COLORS: string[]`, and `repPalette(points: ActivityPoint[]): Map<string, string>` from `@/lib/activity` (client-safe, no server imports); `GET /api/activity` → `ActivityPoint[]` (admin: all, manager: team; others 403 via requireRole).

- [ ] **Step 1: Failing tests** — create `lib/activity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { repPalette, ACTIVITY_COLORS, type ActivityPoint } from './activity'

const pt = (userId: string): ActivityPoint => ({ userId, repName: userId, lat: 0, lng: 0, at: '2026-07-07T10:00:00' })

describe('repPalette', () => {
  it('assigns colors by sorted user id, stable across input order', () => {
    const a = repPalette([pt('b'), pt('a')])
    const b = repPalette([pt('a'), pt('b'), pt('a')])
    expect(a.get('a')).toBe(ACTIVITY_COLORS[0])
    expect(a.get('b')).toBe(ACTIVITY_COLORS[1])
    expect(b.get('a')).toBe(a.get('a'))
    expect(b.get('b')).toBe(a.get('b'))
  })

  it('cycles the palette past its length', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `u${String(i).padStart(2, '0')}`)
    const palette = repPalette(ids.map(pt))
    expect(palette.get('u08')).toBe(ACTIVITY_COLORS[0])
    expect(palette.get('u09')).toBe(ACTIVITY_COLORS[1])
  })

  it('returns an empty map for no points', () => {
    expect(repPalette([]).size).toBe(0)
  })
})
```

- [ ] **Step 2: RED** — `npm run test:run -- lib/activity.test.ts` — FAIL.

- [ ] **Step 3: Implement `lib/activity.ts`**:

```ts
// Client-safe activity helpers — must never import server-only code

export type ActivityPoint = {
  userId: string
  repName: string | null
  lat: number
  lng: number
  at: string
}

export const ACTIVITY_COLORS = ['#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#6366f1']

/** Stable rep→color assignment: unique userIds sorted, mapped onto the palette (cycling). */
export function repPalette(points: ActivityPoint[]): Map<string, string> {
  const ids = [...new Set(points.map(p => p.userId))].sort()
  return new Map(ids.map((id, i) => [id, ACTIVITY_COLORS[i % ACTIVITY_COLORS.length]]))
}
```

- [ ] **Step 4: GREEN** — `npm run test:run -- lib/activity.test.ts` — PASS (3 tests).

- [ ] **Step 5: Create `app/api/activity/route.ts`**:

```ts
export const runtime = 'edge'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql } from 'drizzle-orm'

export const GET = withErrorHandling(async () => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager')
  const { role, teamId } = session!.user!

  const teamFilter = role === 'manager' ? sql`AND u.team_id = ${teamId ?? null}` : sql``
  const rows = await db.execute(sql`
    SELECT x.user_id AS "userId", u.name AS "repName",
      x.lat, x.lng,
      to_char(x.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS at
    FROM (
      SELECT v.user_id, v.created_at, ST_Y(h.location) AS lat, ST_X(h.location) AS lng
      FROM visits v
      JOIN households ho ON ho.id = v.household_id
      JOIN houses h ON h.id = ho.house_id
      WHERE v.created_at >= CURRENT_DATE
      UNION ALL
      SELECT bv.user_id, bv.created_at, ST_Y(b.location) AS lat, ST_X(b.location) AS lng
      FROM business_visits bv
      JOIN businesses b ON b.id = bv.business_id
      WHERE bv.created_at >= CURRENT_DATE
    ) x
    JOIN users u ON u.id = x.user_id
    WHERE true ${teamFilter}
    ORDER BY x.created_at ASC
  `)
  return NextResponse.json(rows.rows)
})
```

- [ ] **Step 6: Verify** — `npx tsc --noEmit && npm run test:run` — clean / pass.

- [ ] **Step 7: Commit**

```bash
git add app/api/activity lib/activity.ts lib/activity.test.ts
git commit -m "feat: team activity API and rep color palette (#8)"
```

---

### Task 2: `ActivityLayer` + MapShell toggle/legend + MapView wiring + gates

**Files:**
- Create: `components/map/ActivityLayer.tsx`
- Modify: `components/map/MapView.tsx`
- Modify: `components/map/MapShell.tsx`

**Interfaces:**
- Consumes: `ActivityPoint`, `repPalette` (Task 1), `GET /api/activity`.
- Produces: `ActivityLayer` props `{ points: ActivityPoint[]; palette: Map<string, string> }`; `LayerVisibility` gains `activity: boolean`.

- [ ] **Step 1: Create `components/map/ActivityLayer.tsx`**:

```tsx
'use client'
import { useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/mapbox'
import type { ActivityPoint } from '@/lib/activity'

type Props = {
  points: ActivityPoint[]
  palette: Map<string, string>
}

export function ActivityLayer({ points, palette }: Props) {
  const geojson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: points.map((p, i) => ({
      type: 'Feature',
      id: i,
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { color: palette.get(p.userId) ?? '#f59e0b' },
    })),
  }), [points, palette])

  return (
    <Source id="activity" type="geojson" data={geojson}>
      <Layer
        id="activity-dots"
        type="circle"
        paint={{
          'circle-color': ['get', 'color'],
          'circle-radius': 5,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.85,
        }}
      />
    </Source>
  )
}
```

- [ ] **Step 2: `MapView.tsx`** — add to Props: `activityPoints: ActivityPoint[]`, `activityPalette: Map<string, string>` (import the type from `@/lib/activity`); destructure both; import `ActivityLayer`; render INSIDE `<Map>` immediately after `<NeighborhoodLayer ... />` and before the pins:

```tsx
      {layers.activity && <ActivityLayer points={activityPoints} palette={activityPalette} />}
```

Also update the `LayerVisibility` export in this file: `export type LayerVisibility = { homes: boolean; businesses: boolean; activity: boolean }`.

- [ ] **Step 3: `MapShell.tsx`** —

1. Imports: `import { repPalette, type ActivityPoint } from '@/lib/activity'` and `useMemo` is already imported.
2. Layers state init gains the key: `useState<LayerVisibility>({ homes: true, businesses: true, activity: false })`.
3. New state + fetch-on-toggle (place near the other layer state):

```tsx
  const [activityPoints, setActivityPoints] = useState<ActivityPoint[]>([])
  const isManager = currentUser.role !== 'rep'

  useEffect(() => {
    if (!layers.activity || !isManager) return
    const controller = new AbortController()
    fetch('/api/activity', { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('load failed')))
      .then(setActivityPoints)
      .catch(() => {})
    return () => controller.abort()
  }, [layers.activity, isManager])

  const activityPalette = useMemo(() => repPalette(activityPoints), [activityPoints])
```

4. The layers chip group currently maps `(['homes', 'businesses'] as const)`. Replace with a role-aware list:

```tsx
            {(isManager ? (['homes', 'businesses', 'activity'] as const) : (['homes', 'businesses'] as const)).map(key => (
              <button
                key={key}
                onClick={() => setLayers(prev => ({ ...prev, [key]: !prev[key] }))}
                className={`px-4 py-2 transition-colors capitalize ${layers[key] ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {key === 'homes' ? 'Homes' : key === 'businesses' ? 'Businesses' : 'Activity'}
              </button>
            ))}
```

5. Legend — insert INSIDE the bottom overlay div, before the `<MapStyleToggle ...>` element, so it sits with the bottom-left controls:

```tsx
        {layers.activity && isManager && activityPoints.length > 0 && (
          <div className="flex max-w-[50%] flex-wrap items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs shadow-lg backdrop-blur-sm">
            {[...activityPalette.entries()].map(([userId, color]) => (
              <span key={userId} className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                {activityPoints.find(p => p.userId === userId)?.repName ?? 'Unknown'}
              </span>
            ))}
          </div>
        )}
```

6. Pass to MapView: `activityPoints={activityPoints}` and `activityPalette={activityPalette}`.

- [ ] **Step 4: Full gates** — `npx tsc --noEmit && npm run test:run && AUTH_GOOGLE_ID=dummy AUTH_GOOGLE_SECRET=dummy AUTH_SECRET=dummy DATABASE_URL='postgresql://dummy:dummy@localhost:5432/dummy' npm run build` — clean / pass / build lists `/api/activity`.

- [ ] **Step 5: Commit**

```bash
git add components/map app/api/activity
git commit -m "feat: activity layer with rep-colored dots and legend (#8)"
```

---

## Self-Review Notes

- **Spec coverage:** API with role gate + team scoping + zone-less `at` (T1); palette helper TDD (T1); layer beneath pins, role-aware toggle, legend, fetch-on-toggle with abort (T2). Out-of-scope items have no tasks. The spec's optional ActivityLayer component test is omitted per its own escape hatch (react-map-gl mocking is disproportionate; noted here).
- **Type consistency:** `ActivityPoint` defined once client-safe; `LayerVisibility` extended in its defining file (MapView) and initialized in MapShell.
- **Legend placement:** inside the existing bottom overlay flex (justify-between) — legend + MapStyleToggle group left, layer chips right; acceptable crowding at mobile widths given max-w-[50%] and wrap.
