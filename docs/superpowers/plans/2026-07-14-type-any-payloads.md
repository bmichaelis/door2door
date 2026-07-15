# Type External-Payload & Mapbox-Draw `any`s Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 12 `any`s in five files with real types and delete the scoped `@typescript-eslint/no-explicit-any` disable, so the rule governs the whole codebase.

**Architecture:** Mapbox-draw event handlers get the installed library event types; external Overture/Overpass GeoJSON payloads get minimal local interfaces (only fields the parsers read); the one DB-result cast reuses the client's row type. Then the per-file disable block is removed and `npm run lint` proves the rule is satisfied.

**Tech Stack:** TypeScript (`strict: true`, `noUncheckedIndexedAccess` OFF), `@types/mapbox__mapbox-gl-draw`, `@types/geojson`, ESLint 9 flat config.

## Global Constraints

- Types only — no behavior/logic change to parsers or draw handlers.
- Use `MapboxDraw.DrawCreateEvent` / `MapboxDraw.DrawUpdateEvent` for draw events; minimal local interfaces (fields the parsers read) for OSM/Overture; `GeoJSON.Feature[]` for parcels; the client's row type for the neighborhoods cast.
- Do NOT touch the separate `scripts/**` `no-require-imports` disable in `eslint.config.mjs`.
- No new dependencies (all `@types/*` already installed).
- This is a compile-time refactor: **no new unit tests** (a test asserting nothing is a defect). Verification is `tsc`, `lint`, `build`, and the existing suite still green.
- Final success: `npm run lint` exits 0 with the rule governing all five files; `npx tsc --noEmit` clean; `next build` green.

---

### Task 1: Draw events + parcels + neighborhoods (mechanical annotations)

**Files:**
- Modify: `components/map/DrawControl.tsx`
- Modify: `components/map/DrawMap.tsx`
- Modify: `app/(app)/admin/parcels/client.tsx`
- Modify: `app/(app)/admin/neighborhoods/client.tsx` (export the row type)
- Modify: `app/(app)/admin/neighborhoods/page.tsx`

Both draw files already `import MapboxDraw from '@mapbox/mapbox-gl-draw'`, so `MapboxDraw.DrawCreateEvent`/`DrawUpdateEvent` are in scope.

- [ ] **Step 1: DrawControl.tsx — annotate the two handlers**

Change:
```ts
    const handleCreate = (e: any) => {
```
to `const handleCreate = (e: MapboxDraw.DrawCreateEvent) => {`, and:
```ts
    const handleUpdate = (e: any) => {
```
to `const handleUpdate = (e: MapboxDraw.DrawUpdateEvent) => {`. Leave the bodies (`e.features[0]?.geometry as GeoJSON.Polygon`) unchanged — `features` is `GeoJSON.Feature[]`.

- [ ] **Step 2: DrawMap.tsx — annotate the two inline callbacks**

Change:
```ts
    map.on('draw.create', (e: any) => {
```
to `map.on('draw.create', (e: MapboxDraw.DrawCreateEvent) => {`, and:
```ts
    map.on('draw.update', (e: any) => {
```
to `map.on('draw.update', (e: MapboxDraw.DrawUpdateEvent) => {`.

- [ ] **Step 3: parcels/client.tsx — type the GeoJSON features**

Replace:
```ts
    let features: any[]
    try {
      const text = await file.text()
      setProgress('Parsing GeoJSON…')
      const geojson = JSON.parse(text)
      features = geojson.type === 'FeatureCollection'
        ? geojson.features
        : geojson.type === 'Feature'
          ? [geojson]
          : []
```
with:
```ts
    let features: GeoJSON.Feature[]
    try {
      const text = await file.text()
      setProgress('Parsing GeoJSON…')
      const geojson = JSON.parse(text) as GeoJSON.FeatureCollection | GeoJSON.Feature
      features = geojson.type === 'FeatureCollection'
        ? geojson.features
        : geojson.type === 'Feature'
          ? [geojson]
          : []
```
`GeoJSON.FeatureCollection`/`Feature` are a discriminated union on `type`, so the branches narrow cleanly. The later `const props = f.properties ?? {}` (f: `GeoJSON.Feature`) already satisfies `detectField(props: Record<string, unknown>, …)` — no change needed there.

- [ ] **Step 4: neighborhoods/client.tsx — export the row type**

Change:
```ts
type Neighborhood = { id: string; name: string; city: string | null; team_id: string | null; team_name: string | null }
```
to `export type Neighborhood = { id: string; name: string; city: string | null; team_id: string | null; team_name: string | null }`.

- [ ] **Step 5: neighborhoods/page.tsx — cast to the row type**

Change the import:
```ts
import { NeighborhoodAdminClient } from './client'
```
to `import { NeighborhoodAdminClient, type Neighborhood } from './client'`, and change:
```ts
  return <NeighborhoodAdminClient neighborhoods={rows.rows as any} teams={teamsList} />
```
to `  return <NeighborhoodAdminClient neighborhoods={rows.rows as Neighborhood[]} teams={teamsList} />`.

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean. (The eslint disable is still present for these files, so lint is unaffected this task.)

```bash
git add components/map/DrawControl.tsx components/map/DrawMap.tsx "app/(app)/admin/parcels/client.tsx" "app/(app)/admin/neighborhoods/client.tsx" "app/(app)/admin/neighborhoods/page.tsx"
git commit -m "refactor: type draw events, parcels features, neighborhoods rows (#31)"
```

---

### Task 2: Businesses import parsers (interfaces + narrowing)

**Files:**
- Modify: `app/(app)/admin/businesses/client.tsx`

**Interfaces:**
- Produces (module-local): `OSMElement`, `OverpassResponse`, `OvertureProps`, `OvertureFeature`, `OvertureInput`.

- [ ] **Step 1: Add the payload interfaces**

Immediately below the imports (before the `// ── OSM ──` comment), insert:
```ts
interface OSMElement {
  type: string
  id: number | string
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}
interface OverpassResponse {
  elements?: OSMElement[]
}

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
// FeatureCollection or a single Feature — both shapes a user might paste/upload.
interface OvertureInput extends OvertureFeature {
  type?: string
  features?: OvertureFeature[]
}
```

- [ ] **Step 2: Type `parseOSMElement`**

Change the signature `function parseOSMElement(el: any): BusinessInput | null {` to `function parseOSMElement(el: OSMElement): BusinessInput | null {`. In its body change:
```ts
  const tags = el.tags ?? {}
```
to `const tags: Record<string, string> = el.tags ?? {}` (so index access stays typed — the `{}` fallback otherwise loses the index signature). Everything else in the function is unchanged: `el.type`, `el.lat`, `el.lon`, `el.center?.lat/lon`, `el.id`, and `tags[...]`/`tags.name` all resolve to `string` (index access returns the value type — `noUncheckedIndexedAccess` is off).

- [ ] **Step 3: Type `parseOvertureFeature`**

Change the signature `function parseOvertureFeature(feature: any): BusinessInput | null {` to `function parseOvertureFeature(feature: OvertureFeature): BusinessInput | null {`. Then replace:
```ts
  if (feature.geometry?.type !== 'Point') return null
  const [lng, lat] = feature.geometry.coordinates
  if (lng == null || lat == null) return null

  const props = feature.properties ?? {}
  const name: string = props.names?.primary
  if (!name?.trim()) return null
```
with:
```ts
  const geom = feature.geometry
  if (geom?.type !== 'Point' || !geom.coordinates) return null
  const [lng, lat] = geom.coordinates
  if (lng == null || lat == null) return null

  const props: OvertureProps = feature.properties ?? {}
  const name = props.names?.primary
  if (!name?.trim()) return null
```
(Rationale: capturing `geom` lets TS narrow `coordinates` to a defined tuple; `props` is annotated so its optional fields are reachable; `name` drops the false `: string` annotation because `props.names?.primary` is `string | undefined` and the very next line guards it.) The rest of the function (`props.confidence`, `props.addresses?.[0]`, `props.categories?.primary`, `props.phones?.[0]`, `props.websites?.[0]`, `props.id`) is unchanged.

- [ ] **Step 4: Type the two fetch-boundary locals**

Change:
```ts
    let osmData: any
```
to `let osmData: OverpassResponse`, and later:
```ts
    const elements: any[] = osmData.elements ?? []
```
to `const elements: OSMElement[] = osmData.elements ?? []`.

Change:
```ts
    let geojson: any
```
to `let geojson: OvertureInput`, and:
```ts
    const features: any[] = geojson.type === 'FeatureCollection'
      ? geojson.features
      : geojson.type === 'Feature'
        ? [geojson]
        : []
```
to:
```ts
    const features: OvertureFeature[] = geojson.type === 'FeatureCollection'
      ? geojson.features ?? []
      : geojson.type === 'Feature'
        ? [geojson]
        : []
```
(`OvertureInput` carries optional `features` and is itself an `OvertureFeature`, so both branches type-check without narrowing gymnastics.)

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add "app/(app)/admin/businesses/client.tsx"
git commit -m "refactor: type OSM/Overture import payloads in businesses admin (#31)"
```

---

### Task 3: Remove the eslint disable and verify the rule governs

**Files:**
- Modify: `eslint.config.mjs`

- [ ] **Step 1: Delete the scoped disable block**

Remove this entire block (the comment and the config object) from `eslint.config.mjs`:
```js
  // any is currently pervasive in external-API GeoJSON payloads (Overture/
  // Overpass) and mapbox-gl-draw events (no exported TS types) in these files.
  // Typed cleanup + removal tracked in issue #31.
  {
    files: [
      'app/(app)/admin/businesses/client.tsx',
      'app/(app)/admin/neighborhoods/page.tsx',
      'app/(app)/admin/parcels/client.tsx',
      'components/map/DrawControl.tsx',
      'components/map/DrawMap.tsx',
    ],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
```
Leave the following `scripts/**` `no-require-imports` block and its comment intact.

- [ ] **Step 2: Verify lint now governs the five files with zero violations**

Run: `npm run lint`
Expected: exits 0. Pre-existing warnings elsewhere (e.g. `scripts/svg-to-neighborhoods.js`) may remain as *warnings*, but there must be **0 errors** and no `no-explicit-any` errors in the five formerly-exempt files. If any `no-explicit-any` error remains, an `any` was missed — fix it in the offending file (same typing approach) before continuing.

- [ ] **Step 3: Full gates**

Run each, expect success:
- `npx tsc --noEmit` — clean.
- `npm run test:run` — green except the known env-only `lib/auth.test.ts` (present on `main`).
- `next build` — green. (Run `npm run build`.)

- [ ] **Step 4: Commit**

```bash
git add eslint.config.mjs
git commit -m "chore: drop scoped no-explicit-any disable; rule now global (#31)"
```

---

## Notes for the executor

- The five files import from libraries whose *own* type definitions contain `any` (e.g. `GeoJSON.GeoJsonProperties`). That is not flagged by `no-explicit-any` — the rule only flags `any` written in our source. Do not try to "fix" library types.
- If `tsc` flags a spot the plan didn't anticipate, prefer the same minimal-interface / narrow-with-a-local approach; do not reintroduce `any` or add an inline `eslint-disable`.
- Verification is compiler + linter + build, by design — there is nothing runtime-observable to unit-test in a type-only refactor.
