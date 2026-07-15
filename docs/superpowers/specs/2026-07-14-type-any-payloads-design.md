# Type the external-payload & mapbox-draw `any`s — Design

**Issue:** #31 (follow-up from #15) · **Date:** 2026-07-14 · **Status:** Approved
(user present; minimal-field-interface typing chosen).

## Why

`eslint.config.mjs` scopes off `@typescript-eslint/no-explicit-any` for five
files where `any` was pervasive — external-API GeoJSON/OSM payloads
(Overture/Overpass) and mapbox-gl-draw event objects. Type them properly and
remove the per-file disable so the rule governs the whole codebase. The #42/#32
CI gate now runs `lint` on every PR, so the removed disable is enforced going
forward.

## The 12 `any`s, in three buckets

### 1. Mapbox-draw events (4) — use the installed library types

`@types/mapbox__mapbox-gl-draw` (present) exports `MapboxDraw.DrawCreateEvent`
and `MapboxDraw.DrawUpdateEvent` (each carries `features: GeoJSON.Feature[]`).

- `components/map/DrawControl.tsx:23,27` — `handleCreate`/`handleUpdate`
  params: `(e: MapboxDraw.DrawCreateEvent)` / `(e: MapboxDraw.DrawUpdateEvent)`.
- `components/map/DrawMap.tsx:24,28` — the `map.on('draw.create', (e) => …)` /
  `draw.update` callbacks: same event types.

Add `import type MapboxDraw from '@mapbox/mapbox-gl-draw'` where needed.

### 2. External GeoJSON/OSM payloads (7) — minimal local interfaces

Colocated in the files that use them; cover only the fields the parsers read.

`app/(app)/admin/businesses/client.tsx` (6):
```ts
interface OSMElement {
  type: string
  id: number | string
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}
interface OverpassResponse { elements?: OSMElement[] }

interface OvertureProps {
  id?: string
  confidence?: number
  names?: { primary?: string }
  categories?: { primary?: string }
  addresses?: Array<{ freeform?: string; locality?: string; region?: string; postcode?: string }>
  phones?: string[]
  websites?: string[]
}
interface OvertureFeature {
  geometry?: { type?: string; coordinates?: [number, number] }
  properties?: OvertureProps
}
interface OvertureFeatureCollection { type?: string; features?: OvertureFeature[] }
```
- `parseOSMElement(el: OSMElement)`, `parseOvertureFeature(feature: OvertureFeature)`.
- `let osmData: OverpassResponse`; `const elements: OSMElement[] = osmData.elements ?? []`.
- `let geojson: OvertureFeatureCollection | OvertureFeature`; the
  `FeatureCollection`/`Feature` branch narrows/asserts to `OvertureFeature[]`.

`app/(app)/admin/parcels/client.tsx` (1): `let features: GeoJSON.Feature[]`
(or a minimal local interface if the parcels import reads non-standard props —
implementer confirms from that file's parsing).

### 3. The DB result cast (1)

`app/(app)/admin/neighborhoods/page.tsx:19` — `rows.rows as any` passed to
`NeighborhoodAdminClient`. Replace with a cast to the row shape the client
expects (`{ id, name, city, team_id, team_name }`) — reuse the client's own
prop element type (export/import it) rather than `any`. This is a cast, not
runtime validation (accepted — the SQL controls the shape).

## Remove the disable

Delete the `{ files: [<5 files>], rules: { '@typescript-eslint/no-explicit-any':
'off' } }` block in `eslint.config.mjs` (and its now-stale preceding comment).
Leave the separate `scripts/**` `no-require-imports` block untouched.

## Testing / gates

Compile-time refactor, no behavior change → no new unit tests. Success:
- `npm run lint` exits 0 with the rule governing all five files (0 errors).
- `npx tsc --noEmit` clean.
- `next build` green and the existing `vitest` suite still passes (minus the
  known env-only `lib/auth.test.ts`).

## Out of scope

The `scripts/**` `no-require-imports` disable (separate follow-up); any
behavior/logic change to the parsers or draw handlers — types only; adding
runtime validation/type-guards for the external payloads (design chose minimal
interfaces + a boundary cast).
