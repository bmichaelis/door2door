# Route Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select businesses on the door2door map, compute an optimal driving order (Mapbox Optimization API + nearest-neighbor fallback), and open the ordered route in Google Maps via a crafted directions URL.

**Architecture:** Pure geo/URL libs + a server-side optimizer (Mapbox, with fallback) behind an edge API route, plus a `RoutePanel` and route-mode wiring on the existing Mapbox map shell. Ephemeral — no persistence, no DB.

**Tech Stack:** Next.js App Router (edge API routes), Mapbox Optimization API (existing `NEXT_PUBLIC_MAPBOX_TOKEN`), Vitest + @testing-library/react (jsdom), TypeScript.

## Global Constraints

- **Targets:** businesses only. **Cap:** 2–10 stops per route.
- **Route shape:** one-way; start is the origin (`source=first`, `roundtrip=false`); optimizer picks the end.
- **Optimization:** Mapbox Optimization API; on ANY failure (no token / non-200 / bad response / network) fall back to `nearestNeighborOrder` — the feature never hard-fails.
- **Coordinates:** callers pass `{lat,lng}`. Mapbox wants `lng,lat`; the Google Maps URL wants `lat,lng`. The libs own the conversion.
- **Google Maps handoff:** `https://www.google.com/maps/dir/?api=1&origin=lat,lng&destination=lat,lng&waypoints=lat,lng|…&travelmode=driving`, stops in the given order (origin = start, destination = last stop, rest = waypoints). Pure string build.
- **API route:** edge runtime; wrap in `withErrorHandling`; `auth()` + `requireRole(session?.user?.role, 'admin','manager','rep')`.
- **Tests:** Vitest (`npx vitest run <path>`), `@` alias = repo root, testing-library for components. The #16 route-harness is NOT on this branch — test the route handler with self-contained mocks.

## File Structure

- **Create** `lib/route/geo.ts` — `LatLng`/`Stop` types, `haversineMeters`, `nearestNeighborOrder`, `nearestN`.
- **Create** `lib/route/google-maps-url.ts` — `buildGoogleMapsDirUrl`.
- **Create** `lib/route/optimize.ts` — `optimizeOrder` (Mapbox + fallback).
- **Create** `app/api/route/optimize/route.ts` — POST handler.
- **Create** `components/map/RoutePanel.tsx` — presentational route panel.
- **Modify** `components/map/MapShell.tsx` — route mode, pin multi-select, RoutePanel wiring, start point, "route what's on the map".
- Tests colocated: `lib/route/geo.test.ts`, `lib/route/google-maps-url.test.ts`, `lib/route/optimize.test.ts`, `app/api/route/optimize/route.test.ts`, `components/map/RoutePanel.test.tsx`.

---

### Task 1: Geo primitives (`lib/route/geo.ts`)

**Files:**
- Create: `lib/route/geo.ts`
- Test: `lib/route/geo.test.ts`

**Interfaces:**
- Produces:
  - `type LatLng = { lat: number; lng: number }`
  - `type Stop = { id: string; name: string; lat: number; lng: number }`
  - `haversineMeters(a: LatLng, b: LatLng): number`
  - `nearestNeighborOrder(start: LatLng, stops: Stop[]): Stop[]` (greedy; does not mutate input)
  - `nearestN(start: LatLng, stops: Stop[], n: number): Stop[]` (closest n to start)

- [ ] **Step 1: Write the failing tests**

```ts
// lib/route/geo.ts test → lib/route/geo.test.ts
import { describe, it, expect } from 'vitest'
import { haversineMeters, nearestNeighborOrder, nearestN, type Stop } from '@/lib/route/geo'

const S = (id: string, lat: number, lng: number): Stop => ({ id, name: id, lat, lng })

describe('haversineMeters', () => {
  it('is ~0 for the same point', () => {
    expect(haversineMeters({ lat: 40, lng: -111 }, { lat: 40, lng: -111 })).toBeLessThan(1)
  })
  it('~111km per degree of latitude', () => {
    const d = haversineMeters({ lat: 40, lng: -111 }, { lat: 41, lng: -111 })
    expect(d).toBeGreaterThan(110000)
    expect(d).toBeLessThan(112000)
  })
})

describe('nearestNeighborOrder', () => {
  it('orders by greedy nearest hop from start', () => {
    const start = { lat: 0, lng: 0 }
    const stops = [S('far', 0, 3), S('near', 0, 1), S('mid', 0, 2)]
    expect(nearestNeighborOrder(start, stops).map(s => s.id)).toEqual(['near', 'mid', 'far'])
  })
  it('does not mutate the input array', () => {
    const stops = [S('a', 0, 2), S('b', 0, 1)]
    nearestNeighborOrder({ lat: 0, lng: 0 }, stops)
    expect(stops.map(s => s.id)).toEqual(['a', 'b'])
  })
})

describe('nearestN', () => {
  it('returns the n closest to start', () => {
    const start = { lat: 0, lng: 0 }
    const stops = [S('c', 0, 3), S('a', 0, 1), S('b', 0, 2)]
    expect(nearestN(start, stops, 2).map(s => s.id)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/route/geo.test.ts`
Expected: FAIL — `Cannot find module '@/lib/route/geo'`.

- [ ] **Step 3: Implement**

```ts
// lib/route/geo.ts
export type LatLng = { lat: number; lng: number }
export type Stop = { id: string; name: string; lat: number; lng: number }

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function nearestNeighborOrder(start: LatLng, stops: Stop[]): Stop[] {
  const remaining = [...stops]
  const ordered: Stop[] = []
  let cur: LatLng = start
  while (remaining.length) {
    let bestI = 0
    let bestD = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMeters(cur, remaining[i])
      if (d < bestD) {
        bestD = d
        bestI = i
      }
    }
    const [next] = remaining.splice(bestI, 1)
    ordered.push(next)
    cur = next
  }
  return ordered
}

export function nearestN(start: LatLng, stops: Stop[], n: number): Stop[] {
  return [...stops]
    .sort((a, b) => haversineMeters(start, a) - haversineMeters(start, b))
    .slice(0, n)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/route/geo.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/route/geo.ts lib/route/geo.test.ts
git commit -m "feat(route): geo primitives — haversine, nearest-neighbor order, nearest-n"
```

---

### Task 2: Google Maps directions URL (`lib/route/google-maps-url.ts`)

**Files:**
- Create: `lib/route/google-maps-url.ts`
- Test: `lib/route/google-maps-url.test.ts`

**Interfaces:**
- Consumes: `LatLng`, `Stop` (Task 1).
- Produces: `buildGoogleMapsDirUrl(start: LatLng, ordered: Stop[]): string`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/route/google-maps-url.test.ts
import { describe, it, expect } from 'vitest'
import { buildGoogleMapsDirUrl } from '@/lib/route/google-maps-url'
import type { Stop } from '@/lib/route/geo'

const S = (id: string, lat: number, lng: number): Stop => ({ id, name: id, lat, lng })

describe('buildGoogleMapsDirUrl', () => {
  it('builds a directions URL: origin=start, destination=last, rest=waypoints in order', () => {
    const url = buildGoogleMapsDirUrl({ lat: 40.0, lng: -111.0 }, [S('a', 40.1, -111.1), S('b', 40.2, -111.2), S('c', 40.3, -111.3)])
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://www.google.com/maps/dir/')
    expect(u.searchParams.get('api')).toBe('1')
    expect(u.searchParams.get('origin')).toBe('40,-111')
    expect(u.searchParams.get('destination')).toBe('40.3,-111.3')
    expect(u.searchParams.get('waypoints')).toBe('40.1,-111.1|40.2,-111.2')
    expect(u.searchParams.get('travelmode')).toBe('driving')
  })
  it('omits waypoints when there is a single stop', () => {
    const u = new URL(buildGoogleMapsDirUrl({ lat: 1, lng: 2 }, [S('a', 3, 4)]))
    expect(u.searchParams.get('destination')).toBe('3,4')
    expect(u.searchParams.get('waypoints')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/route/google-maps-url.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/route/google-maps-url.ts
import type { LatLng, Stop } from '@/lib/route/geo'

export function buildGoogleMapsDirUrl(start: LatLng, ordered: Stop[]): string {
  const pt = (p: LatLng) => `${p.lat},${p.lng}`
  const destination = ordered[ordered.length - 1]
  const waypoints = ordered.slice(0, -1).map(pt).join('|')
  const params = new URLSearchParams({
    api: '1',
    origin: pt(start),
    destination: pt(destination),
    travelmode: 'driving',
  })
  if (waypoints) params.set('waypoints', waypoints)
  return `https://www.google.com/maps/dir/?${params.toString()}`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/route/google-maps-url.test.ts`
Expected: PASS (2 tests). (`URLSearchParams` percent-encodes `,` and `|`; `URL.searchParams.get` decodes them back, so the asserted raw values hold.)

- [ ] **Step 5: Commit**

```bash
git add lib/route/google-maps-url.ts lib/route/google-maps-url.test.ts
git commit -m "feat(route): Google Maps directions URL builder"
```

---

### Task 3: Optimizer (`lib/route/optimize.ts`)

**Files:**
- Create: `lib/route/optimize.ts`
- Test: `lib/route/optimize.test.ts`

**Interfaces:**
- Consumes: `nearestNeighborOrder`, `LatLng`, `Stop` (Task 1); `process.env.NEXT_PUBLIC_MAPBOX_TOKEN`; global `fetch`.
- Produces: `optimizeOrder(start: LatLng, stops: Stop[]): Promise<Stop[]>`

Mapbox Optimization response shape used: `{ code: 'Ok', waypoints: [{ waypoint_index: number }, …] }`, where `waypoints[i]` corresponds to input coordinate `i` (index 0 = start), and `waypoint_index` is that point's position in the optimized trip.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/route/optimize.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Stop } from '@/lib/route/geo'

const S = (id: string, lat: number, lng: number): Stop => ({ id, name: id, lat, lng })
const START = { lat: 0, lng: 0 }
const STOPS = [S('a', 0, 1), S('b', 0, 2), S('c', 0, 3)]

beforeEach(() => vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.test'))
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('optimizeOrder', () => {
  it('reorders stops by Mapbox waypoint_index (start is waypoints[0])', async () => {
    // trip order: start(0) -> c(1) -> a(2) -> b(3); waypoints align to input order [start,a,b,c]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'Ok', waypoints: [
        { waypoint_index: 0 }, // start
        { waypoint_index: 2 }, // a
        { waypoint_index: 3 }, // b
        { waypoint_index: 1 }, // c
      ] }),
    }))
    const { optimizeOrder } = await import('@/lib/route/optimize')
    expect((await optimizeOrder(START, STOPS)).map(s => s.id)).toEqual(['c', 'a', 'b'])
  })

  it('falls back to nearest-neighbor when Mapbox errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }))
    const { optimizeOrder } = await import('@/lib/route/optimize')
    // nearest-neighbor from start(0,0): a(0,1) -> b(0,2) -> c(0,3)
    expect((await optimizeOrder(START, STOPS)).map(s => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('falls back when fetch rejects (network)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const { optimizeOrder } = await import('@/lib/route/optimize')
    expect((await optimizeOrder(START, STOPS)).map(s => s.id)).toEqual(['a', 'b', 'c'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/route/optimize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/route/optimize.ts
import { nearestNeighborOrder, type LatLng, type Stop } from '@/lib/route/geo'

export async function optimizeOrder(start: LatLng, stops: Stop[]): Promise<Stop[]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  try {
    if (!token) throw new Error('NEXT_PUBLIC_MAPBOX_TOKEN not set')
    const coords = [start, ...stops].map((p) => `${p.lng},${p.lat}`).join(';')
    const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coords}?source=first&roundtrip=false&access_token=${token}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Mapbox Optimization ${res.status}`)
    const data = (await res.json()) as { code?: string; waypoints?: { waypoint_index: number }[] }
    if (data.code !== 'Ok' || !data.waypoints || data.waypoints.length !== stops.length + 1) {
      throw new Error('Unexpected Mapbox Optimization response')
    }
    // waypoints[0] = start; waypoints[i+1] corresponds to stops[i]
    return stops
      .map((s, i) => ({ s, idx: data.waypoints![i + 1].waypoint_index }))
      .sort((x, y) => x.idx - y.idx)
      .map((x) => x.s)
  } catch (e) {
    console.error('[route] optimizeOrder fell back to nearest-neighbor', e)
    return nearestNeighborOrder(start, stops)
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/route/optimize.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/route/optimize.ts lib/route/optimize.test.ts
git commit -m "feat(route): Mapbox Optimization with nearest-neighbor fallback"
```

---

### Task 4: Optimize API route (`app/api/route/optimize/route.ts`)

**Files:**
- Create: `app/api/route/optimize/route.ts`
- Test: `app/api/route/optimize/route.test.ts`

**Interfaces:**
- Consumes: `optimizeOrder` (Task 3), `buildGoogleMapsDirUrl` (Task 2), `LatLng`/`Stop` (Task 1); `auth` (`@/lib/auth`), `requireRole` (`@/lib/permissions`), `withErrorHandling` (`@/lib/api`).
- Produces: `POST` → `{ orderedStops: Stop[], googleMapsUrl: string }`; 400 on bad input; 403 via `requireRole`.

- [ ] **Step 1: Write the failing test**

```ts
// app/api/route/optimize/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { role: 'rep', teamId: 't1' } }) }))
// optimizeOrder returns a deterministic order so we can assert the URL is built from it
vi.mock('@/lib/route/optimize', () => ({ optimizeOrder: vi.fn(async (_s, stops) => [...stops].reverse()) }))

const CTX = { params: Promise.resolve({}) }
const post = (body: unknown) =>
  new NextRequest('http://x/api/route/optimize', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

beforeEach(() => vi.clearAllMocks())

describe('POST /api/route/optimize', () => {
  it('returns ordered stops + a Google Maps URL', async () => {
    const { POST } = await import('@/app/api/route/optimize/route')
    const res = await POST(post({ start: { lat: 40, lng: -111 }, stops: [
      { id: 'a', name: 'A', lat: 40.1, lng: -111.1 },
      { id: 'b', name: 'B', lat: 40.2, lng: -111.2 },
    ] }), CTX)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.orderedStops.map((s: { id: string }) => s.id)).toEqual(['b', 'a']) // reversed by the mock
    expect(json.googleMapsUrl).toContain('https://www.google.com/maps/dir/')
    expect(json.googleMapsUrl).toContain('destination=40.1%2C-111.1') // last after reverse = 'a'
  })

  it('rejects fewer than 2 stops with 400', async () => {
    const { POST } = await import('@/app/api/route/optimize/route')
    const res = await POST(post({ start: { lat: 0, lng: 0 }, stops: [{ id: 'a', name: 'A', lat: 1, lng: 1 }] }), CTX)
    expect(res.status).toBe(400)
  })

  it('rejects more than 10 stops with 400', async () => {
    const stops = Array.from({ length: 11 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, lat: i, lng: i }))
    const { POST } = await import('@/app/api/route/optimize/route')
    const res = await POST(post({ start: { lat: 0, lng: 0 }, stops }), CTX)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/route/optimize/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// app/api/route/optimize/route.ts
export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { optimizeOrder } from '@/lib/route/optimize'
import { buildGoogleMapsDirUrl } from '@/lib/route/google-maps-url'
import type { LatLng, Stop } from '@/lib/route/geo'

function isLatLng(v: unknown): v is LatLng {
  return !!v && typeof (v as LatLng).lat === 'number' && typeof (v as LatLng).lng === 'number'
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')

  const body = (await req.json()) as { start?: unknown; stops?: unknown }
  if (!isLatLng(body.start)) {
    return NextResponse.json({ error: 'start {lat,lng} required' }, { status: 400 })
  }
  const stops = body.stops
  if (!Array.isArray(stops) || stops.length < 2 || stops.length > 10 || !stops.every(isLatLng)) {
    return NextResponse.json({ error: 'stops must be 2–10 points with {lat,lng}' }, { status: 400 })
  }

  const orderedStops = await optimizeOrder(body.start, stops as Stop[])
  const googleMapsUrl = buildGoogleMapsDirUrl(body.start, orderedStops)
  return NextResponse.json({ orderedStops, googleMapsUrl })
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/api/route/optimize/route.test.ts`
Expected: PASS (3 tests). (`requireRole` is the real one — `'rep'` is allowed, so it doesn't throw.)

- [ ] **Step 5: Commit**

```bash
git add app/api/route/optimize/route.ts app/api/route/optimize/route.test.ts
git commit -m "feat(route): POST /api/route/optimize (auth, validation, optimize + URL)"
```

---

### Task 5: RoutePanel component (`components/map/RoutePanel.tsx`)

**Files:**
- Create: `components/map/RoutePanel.tsx`
- Test: `components/map/RoutePanel.test.tsx`

**Interfaces:**
- Consumes: `Stop` (Task 1).
- Produces: `RoutePanel` (default export) with props:

```ts
export type RoutePanelProps = {
  stops: Stop[]                         // currently selected (pre-plan) OR the ordered result
  ordered: boolean                      // true once a plan has been computed (numbered display)
  hasStart: boolean
  planning: boolean
  error: string | null
  googleMapsUrl: string | null
  onUseMyLocation: () => void
  onAddressSubmit: (address: string) => void
  onRemoveStop: (id: string) => void
  onPlan: () => void
  onClear: () => void
  onClose: () => void
}
```

Behavior: shows a "Use my location" button + an address field (submits via `onAddressSubmit`); lists the stops (numbered when `ordered`, each with a remove ✕ calling `onRemoveStop`); a **Plan route** button, disabled when `planning || !hasStart || stops.length < 2`, calling `onPlan`; when `googleMapsUrl` is set, an **Open in Google Maps** link (`<a href target="_blank" rel="noopener noreferrer">`); shows `error` when present; a Clear and a Close control.

- [ ] **Step 1: Write the failing tests**

```tsx
// components/map/RoutePanel.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import RoutePanel from './RoutePanel'
import type { Stop } from '@/lib/route/geo'

const S = (id: string): Stop => ({ id, name: `Name ${id}`, lat: 0, lng: 0 })
const base = {
  stops: [S('a'), S('b')], ordered: false, hasStart: true, planning: false,
  error: null as string | null, googleMapsUrl: null as string | null,
  onUseMyLocation: vi.fn(), onAddressSubmit: vi.fn(), onRemoveStop: vi.fn(),
  onPlan: vi.fn(), onClear: vi.fn(), onClose: vi.fn(),
}

describe('RoutePanel', () => {
  it('disables Plan route with fewer than 2 stops', () => {
    render(<RoutePanel {...base} stops={[S('a')]} />)
    expect(screen.getByRole('button', { name: /plan route/i })).toBeDisabled()
  })
  it('disables Plan route when there is no start', () => {
    render(<RoutePanel {...base} hasStart={false} />)
    expect(screen.getByRole('button', { name: /plan route/i })).toBeDisabled()
  })
  it('calls onPlan when Plan route is clicked', async () => {
    const onPlan = vi.fn()
    render(<RoutePanel {...base} onPlan={onPlan} />)
    await userEvent.click(screen.getByRole('button', { name: /plan route/i }))
    expect(onPlan).toHaveBeenCalled()
  })
  it('shows the Open in Google Maps link once a URL is present', () => {
    render(<RoutePanel {...base} ordered googleMapsUrl="https://www.google.com/maps/dir/?api=1" />)
    const link = screen.getByRole('link', { name: /open in google maps/i })
    expect(link).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/map/RoutePanel.test.tsx`
Expected: FAIL — `Cannot find module './RoutePanel'`.

- [ ] **Step 3: Implement**

```tsx
// components/map/RoutePanel.tsx
'use client'
import { useState } from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Stop } from '@/lib/route/geo'

export type RoutePanelProps = {
  stops: Stop[]
  ordered: boolean
  hasStart: boolean
  planning: boolean
  error: string | null
  googleMapsUrl: string | null
  onUseMyLocation: () => void
  onAddressSubmit: (address: string) => void
  onRemoveStop: (id: string) => void
  onPlan: () => void
  onClear: () => void
  onClose: () => void
}

export default function RoutePanel(props: RoutePanelProps) {
  const [address, setAddress] = useState('')
  const canPlan = !props.planning && props.hasStart && props.stops.length >= 2

  return (
    <div className="absolute right-3 top-3 z-10 flex w-72 flex-col gap-3 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Plan a route</h2>
        <button type="button" aria-label="Close" onClick={props.onClose}><XIcon className="h-4 w-4" /></button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Start {props.hasStart ? '· set' : ''}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={props.onUseMyLocation}>Use my location</Button>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (address.trim()) props.onAddressSubmit(address.trim()) }}
        >
          <input
            className="h-8 flex-1 rounded border bg-transparent px-2 text-sm"
            placeholder="or a start address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <Button size="sm" variant="outline" type="submit">Set</Button>
        </form>
      </div>

      <ol className="flex max-h-56 flex-col gap-1 overflow-auto text-sm">
        {props.stops.map((s, i) => (
          <li key={s.id} className="flex items-center justify-between gap-2">
            <span>{props.ordered ? `${i + 1}. ` : '• '}{s.name}</span>
            <button type="button" aria-label={`Remove ${s.name}`} onClick={() => props.onRemoveStop(s.id)}>
              <XIcon className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ol>

      {props.error && <p className="text-xs text-destructive">{props.error}</p>}

      <div className="flex items-center justify-between gap-2">
        <button type="button" className="text-xs text-muted-foreground underline" onClick={props.onClear}>Clear</button>
        <Button size="sm" disabled={!canPlan} onClick={props.onPlan}>
          {props.planning ? 'Planning…' : 'Plan route'}
        </Button>
      </div>

      {props.googleMapsUrl && (
        <a
          className="rounded bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground"
          href={props.googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Google Maps
        </a>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run components/map/RoutePanel.test.tsx`
Expected: PASS (4 tests).

> If `@/components/ui/button` exposes a different prop shape than `size`/`variant`, mirror the usage in an existing component (e.g. `components/map/MapStyleToggle.tsx` or another consumer of `Button`) and adjust — do not invent props.

- [ ] **Step 5: Commit**

```bash
git add components/map/RoutePanel.tsx components/map/RoutePanel.test.tsx
git commit -m "feat(route): RoutePanel — start control, stop list, plan + open-in-maps"
```

---

### Task 6: Wire route mode into MapShell (`components/map/MapShell.tsx`)

**Files:**
- Modify: `components/map/MapShell.tsx`

**Interfaces:**
- Consumes: `RoutePanel` (Task 5), `nearestN`, `Stop`, `LatLng` (Task 1); the existing `geocodeAddress` (`@/lib/mapbox`), the existing `businesses: BusinessRow[]` state, and the existing business-pin click path.
- Produces: no new exported symbols — integration wiring only.

> This is UI integration in an existing component. Read `MapShell.tsx`, `BusinessPins.tsx`, and how a business pin click currently sets `selectedBusiness`, before wiring. Verify by lint + build + the manual smoke; do not add brittle full-map DOM tests.

- [ ] **Step 1: Add route-mode state + a "Plan route" toggle**

In `MapShell.tsx`, add imports and state (place near the other `useState` hooks around the existing `selectedBusiness` state):

```tsx
import RoutePanel from './RoutePanel'
import { nearestN, type LatLng, type Stop } from '@/lib/route/geo'
import { geocodeAddress } from '@/lib/mapbox'
```

```tsx
const [routeMode, setRouteMode] = useState(false)
const [routeStops, setRouteStops] = useState<Stop[]>([])
const [routeStart, setRouteStart] = useState<LatLng | null>(null)
const [routeOrdered, setRouteOrdered] = useState<Stop[] | null>(null)
const [routeUrl, setRouteUrl] = useState<string | null>(null)
const [routePlanning, setRoutePlanning] = useState(false)
const [routeError, setRouteError] = useState<string | null>(null)
const MAX_STOPS = 10

const toStop = useCallback((b: { id: string; name: string; lat: number; lng: number }): Stop =>
  ({ id: b.id, name: b.name, lat: b.lat, lng: b.lng }), [])
```

Add a toggle button in the map's control cluster (next to the existing `LocateMeButton`/`MapStyleToggle` controls):

```tsx
<button
  type="button"
  aria-label="Plan route"
  onClick={() => setRouteMode((m) => !m)}
  className={`flex h-9 w-9 items-center justify-center rounded-full border shadow-lg backdrop-blur-sm transition-colors ${routeMode ? 'bg-primary text-primary-foreground' : 'bg-background/95 text-muted-foreground hover:text-foreground'}`}
>
  {/* lucide RouteIcon — import { RouteIcon } from 'lucide-react' */}
  <RouteIcon className="h-4 w-4" />
</button>
```

- [ ] **Step 2: Make a business-pin click toggle selection while in route mode**

Where a business pin click currently runs `setSelectedBusiness(business)`, branch on `routeMode`: in route mode, toggle the business in `routeStops` (respecting `MAX_STOPS`) and reset any prior computed order; otherwise keep the existing panel behavior.

```tsx
function handleBusinessClick(b: BusinessRow) {
  if (!routeMode) { setSelectedBusiness(b); return }
  setRouteOrdered(null); setRouteUrl(null); setRouteError(null)
  setRouteStops((prev) => {
    if (prev.some((s) => s.id === b.id)) return prev.filter((s) => s.id !== b.id)
    if (prev.length >= MAX_STOPS) { setRouteError(`Routes are limited to ${MAX_STOPS} stops`); return prev }
    return [...prev, toStop(b)]
  })
}
```

Route the existing pin-click handler through `handleBusinessClick` (replace the direct `setSelectedBusiness(...)` call at the business-pin click site with `handleBusinessClick(...)`).

- [ ] **Step 3: Render RoutePanel + wire the handlers (incl. "route what's on the map")**

Render when `routeMode` is on (inside the map container, sibling to the existing controls):

```tsx
{routeMode && (
  <RoutePanel
    stops={routeOrdered ?? routeStops}
    ordered={routeOrdered !== null}
    hasStart={routeStart !== null}
    planning={routePlanning}
    error={routeError}
    googleMapsUrl={routeUrl}
    onUseMyLocation={() => {
      if (!('geolocation' in navigator)) { setRouteError('Location unavailable'); return }
      navigator.geolocation.getCurrentPosition(
        (pos) => { setRouteStart({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setRouteError(null) },
        () => setRouteError('Location denied — enter a start address'),
      )
    }}
    onAddressSubmit={async (addr) => {
      const g = await geocodeAddress(addr)
      if (!g) { setRouteError("Couldn't find that address"); return }
      setRouteStart({ lat: g.lat, lng: g.lng }); setRouteError(null)
    }}
    onRemoveStop={(id) => { setRouteOrdered(null); setRouteUrl(null); setRouteStops((p) => p.filter((s) => s.id !== id)) }}
    onClear={() => { setRouteStops([]); setRouteOrdered(null); setRouteUrl(null); setRouteError(null) }}
    onClose={() => setRouteMode(false)}
    onPlan={async () => {
      if (!routeStart || routeStops.length < 2) return
      setRoutePlanning(true); setRouteError(null)
      try {
        const res = await fetch('/api/route/optimize', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ start: routeStart, stops: routeStops }),
        })
        if (!res.ok) throw new Error('optimize failed')
        const data = (await res.json()) as { orderedStops: Stop[]; googleMapsUrl: string }
        setRouteOrdered(data.orderedStops); setRouteUrl(data.googleMapsUrl)
      } catch {
        setRouteError('Could not plan the route — try again')
      } finally {
        setRoutePlanning(false)
      }
    }}
  />
)}
```

Add a **"Route what's on the map"** button inside the panel area or the control cluster that seeds `routeStops` from the businesses currently loaded, trimmed to the nearest `MAX_STOPS` to the start (requires a start first):

```tsx
<button
  type="button"
  className="text-xs underline"
  disabled={!routeStart}
  onClick={() => {
    if (!routeStart) return
    const all = businesses.map(toStop)
    setRouteOrdered(null); setRouteUrl(null)
    setRouteStops(nearestN(routeStart, all, MAX_STOPS))
  }}
>
  Route what&apos;s on the map
</button>
```

- [ ] **Step 4: Verify lint, types, and build**

Run: `npm run lint && npm run build`
Expected: lint clean; build succeeds (`components/map/MapShell.tsx` compiles; the `/api/route/optimize` edge route builds).

- [ ] **Step 5: Run the full unit suite (no regressions)**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/map/MapShell.tsx
git commit -m "feat(route): route mode, pin multi-select, and RoutePanel wiring in MapShell"
```

- [ ] **Step 7: Manual smoke (documented, not automated)**

With `NEXT_PUBLIC_MAPBOX_TOKEN` set and `npm run dev`: open the map, click **Plan route**, set a start (Use my location or an address), tap 2–10 business pins (or **Route what's on the map**), click **Plan route**, confirm the numbered order appears, then **Open in Google Maps** opens the ordered route (deep-links the app on mobile).

---

## Notes for the executor

- **Out of scope (do not build):** houses/mixed routes, saved/named routes, chunking >10 into multiple routes, round-trip, in-app turn-by-turn, and drawing the optimized polyline/numbered pins on the map (the panel's numbered list + Google Maps handoff carry the ordering in v1). See the spec's "Out of Scope."
- **No env/DB changes:** `NEXT_PUBLIC_MAPBOX_TOKEN` already exists; the feature is ephemeral and the API route does not touch the database.
- **Fallback is silent:** a Mapbox Optimization failure must still return a route (nearest-neighbor) — never surface it as an error to the user.
