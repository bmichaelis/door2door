# Structured Address Fields & GeoJSON Import — Design Spec

**Date:** 2026-04-09

---

## Overview

Replace the single `address` text field on the `houses` table with structured address fields and a PostGIS point geometry column. Add a GeoJSON import route for bulk-loading OpenAddresses data without Mapbox API calls. Update the CSV import and manual add-house flow to use the new schema.

---

## Motivation

- Structured fields enable filtering/grouping by street, city, postcode
- PostGIS `geometry(Point, 4326)` is consistent with neighborhood boundary storage and enables future spatial queries
- OpenAddresses GeoJSON includes coordinates and structured fields — no geocoding needed for bulk import
- Existing CSV import is kept for cases where only address strings are available

---

## Schema Changes (`lib/db/schema.ts`)

### `houses` table

**Remove:**
- `address` (text)
- `lat` (doublePrecision)
- `lng` (doublePrecision)

**Add:**
| Column | Drizzle type | DB column | Nullable |
|---|---|---|---|
| `number` | `text` NOT NULL | `number` | No |
| `street` | `text` NOT NULL | `street` | No |
| `unit` | `text` | `unit` | Yes |
| `city` | `text` NOT NULL | `city` | No |
| `region` | `text` NOT NULL | `region` | No (state abbreviation, e.g. "UT") |
| `postcode` | `text` NOT NULL | `postcode` | No |
| `externalId` | `text` unique | `external_id` | Yes |
| `location` | `geometryPoint` | `location` | No |

`externalId` stores the OpenAddresses `hash` field for dedup. CSV-imported and manually-added houses leave it null.

`location` uses a new `geometryPoint` custom type (parallel to the existing `geometry` custom type which is hardcoded to `Polygon`):

```ts
const geometryPoint = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(Point, 4326)'
  },
})
```

### Migration

Generate with `npx drizzle-kit generate`, apply with `npx drizzle-kit migrate`. No backfill needed — no legacy data. The migration drops the old columns and adds the new ones. Any existing rows in `houses` must be cleared before migrating (truncate in dev).

---

## Data Helpers

### `lib/mapbox.ts` — updated `geocodeAddress`

Update to extract structured components from the Mapbox response:

```ts
type GeocodeResult = {
  lat: number
  lng: number
  number: string
  street: string
  city: string
  region: string
  postcode: string
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null>
```

Mapbox response fields:
- `feature.address` → `number`
- `feature.text` → `street`
- `feature.geometry.coordinates` → `[lng, lat]`
- `feature.context` → find by `id` prefix: `postcode.*`, `place.*` (city), `region.*` (short_code stripped of `US-` prefix)

Add a new `reverseGeocode` function for the tap-to-add flow:

```ts
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null>
```

Uses Mapbox reverse geocoding endpoint: `mapbox.places/${lng},${lat}.json`. Same response parsing as `geocodeAddress`.

### `lib/houses.ts` — new file

```ts
import type { House } from '@/lib/db/schema'

export function formatAddress(
  house: Pick<House, 'number' | 'street' | 'unit' | 'city' | 'region' | 'postcode'>
): string {
  const line1 = `${house.number} ${house.street}`
  const line2 = house.unit ? `Unit ${house.unit}` : null
  const line3 = `${house.city}, ${house.region} ${house.postcode}`
  return [line1, line2, line3].filter(Boolean).join(', ')
}
```

---

## Import Routes

### `app/api/houses/import/geojson/route.ts` — new

Accepts multipart form with a newline-delimited GeoJSON file (one Feature per line, as OpenAddresses provides). Admin or manager only.

- Parse each line as a GeoJSON Feature
- Extract `geometry.coordinates` → `[lng, lat]`
- Extract `properties`: `number`, `street`, `unit`, `city`, `region`, `postcode`, `hash`
- Skip features missing `number` or `street`
- Batch DB operations in groups of 500
- For each batch: run `ST_Within` neighborhood assignment per house, insert with `onConflictDoNothing` on `external_id`
- Returns `{ imported, skipped, total }`

No Mapbox API calls. No rate limiting needed.

### `app/api/houses/import/route.ts` — updated

Interface unchanged: multipart form, one address string per line, no header.

- Call updated `geocodeAddress` which now returns structured fields
- Insert using new schema columns (`number`, `street`, `city`, `region`, `postcode`, `location`)
- `externalId` is null for CSV-imported houses
- Batch size stays at 10 (Mapbox rate limit protection)

---

## API Route Changes

### `app/api/houses/route.ts` — POST updated

Accept structured fields instead of `address`:

```ts
{ number, street, unit?, city, region, postcode, lat, lng }
```

Validate: `number`, `street`, `city`, `region`, `postcode`, `lat`, `lng` all required.

Convert lat/lng to PostGIS point on insert:
```sql
ST_SetSRID(ST_Point(${lng}, ${lat}), 4326)
```

GET routes remain unchanged in behavior — they return house rows which now have structured fields instead of `address`.

---

## UI Changes

### `components/forms/HouseForm.tsx` — updated

Replace single address input with:
- On mount: call `reverseGeocode(lat, lng)` to pre-fill fields from tap coordinates
- Separate inputs: **Number**, **Street**, **Unit** (optional), **City**, **Region**, **Postcode**
- Fields are pre-filled from reverse geocode result but editable
- `onSubmit` callback signature changes from `(address: string) => void` to `(data: HouseFormData) => void`

```ts
type HouseFormData = {
  number: string
  street: string
  unit: string
  city: string
  region: string
  postcode: string
}
```

### `components/map/MapShell.tsx` — updated

`handleAddHouse` updated to accept `HouseFormData` and POST structured fields + `lat`/`lng` to `/api/houses`.

### `components/map/HousePanel.tsx` — updated

Line 122: replace `{house.address}` with `{formatAddress(house)}` from `lib/houses.ts`.

---

## Scope

- No changes to households, visits, products, teams, or users
- No changes to neighborhood assignment logic (ST_Within still works the same)
- No new UI pages — changes are confined to existing components and routes
- Admin import UI (how files are uploaded) is out of scope — assumes files are POSTed directly to the import endpoints
