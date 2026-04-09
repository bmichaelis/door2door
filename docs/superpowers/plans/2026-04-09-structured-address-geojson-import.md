# Structured Address Fields & GeoJSON Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `address`/`lat`/`lng` columns on the `houses` table with structured address fields and a PostGIS point geometry column, add a GeoJSON bulk import route, and update all consumers.

**Architecture:** Schema-first migration with no legacy data to preserve. A `HouseRow` type (lat/lng extracted from PostGIS point) is the UI-facing type. All GET routes extract coordinates via `ST_X`/`ST_Y`. Inserts use `sql\`ST_SetSRID(ST_Point(...))\``. Two import paths: GeoJSON (no API calls, batch 500) and CSV (Mapbox geocoding, batch 10). A new `reverseGeocode` function pre-fills `HouseForm` fields on map tap.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, Neon Postgres + PostGIS, `react-map-gl`, Vitest + @testing-library/react

---

## File Map

**New files:**
- `lib/houses.ts` — `formatAddress` helper
- `app/api/houses/import/geojson/route.ts` — bulk GeoJSON import
- `lib/houses.test.ts` — formatAddress tests
- `lib/mapbox.test.ts` — geocodeAddress + reverseGeocode tests
- `lib/db/migrations/0002_houses_structured_fields.sql` — schema migration

**Modified files:**
- `lib/db/schema.ts` — add `geometryPoint` type, update `houses` table, add `HouseRow` type, update `House` schema test
- `lib/db/schema.test.ts` — update houses column assertions
- `lib/mapbox.ts` — update `geocodeAddress` return type, add `reverseGeocode`
- `app/api/houses/import/route.ts` — use new `geocodeAddress` return type
- `app/api/houses/route.ts` — POST accepts structured fields + lat/lng; GET extracts ST_X/ST_Y
- `app/api/houses/[id]/route.ts` — remove `address` field handling
- `components/forms/HouseForm.tsx` — separate fields + reverse geocode pre-fill
- `components/map/MapShell.tsx` — pass structured fields to POST
- `components/map/HousePanel.tsx` — use `formatAddress`
- `components/map/HousePins.tsx` — use `HouseRow` type
- `components/map/MapView.tsx` — use `HouseRow` type

---

## Task 1: Schema Update + Migration

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/schema.test.ts`
- Create: `lib/db/migrations/0002_houses_structured_fields.sql`

- [ ] **Step 1: Update `lib/db/schema.ts`**

Replace the file with:

```typescript
import {
  pgTable, uuid, text, boolean, timestamp, integer, primaryKey
} from 'drizzle-orm/pg-core'
import { customType } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// PostGIS polygon type (for neighborhood boundaries)
const geometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(Polygon, 4326)'
  },
})

// PostGIS point type (for house locations)
const geometryPoint = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(Point, 4326)'
  },
})

export const teams = pgTable('teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  managerId: uuid('manager_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified'),
  image: text('image'),
  role: text('role', { enum: ['admin', 'manager', 'rep'] }),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const accounts = pgTable('accounts', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (table) => ({
  pk: primaryKey({ columns: [table.provider, table.providerAccountId] }),
}))

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires').notNull(),
})

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.identifier, table.token] }),
}))

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const neighborhoods = pgTable('neighborhoods', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  teamId: uuid('team_id').references(() => teams.id),
  boundary: geometry('boundary'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const houses = pgTable('houses', {
  id: uuid('id').defaultRandom().primaryKey(),
  number: text('number').notNull(),
  street: text('street').notNull(),
  unit: text('unit'),
  city: text('city').notNull(),
  region: text('region').notNull(),
  postcode: text('postcode').notNull(),
  externalId: text('external_id').unique(),
  location: geometryPoint('location').notNull(),
  neighborhoodId: uuid('neighborhood_id').references(() => neighborhoods.id),
  doNotKnock: boolean('do_not_knock').default(false).notNull(),
  noSolicitingSign: boolean('no_soliciting_sign').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const households = pgTable('households', {
  id: uuid('id').defaultRandom().primaryKey(),
  houseId: uuid('house_id').notNull().references(() => houses.id),
  surname: text('surname'),
  headOfHouseholdName: text('head_of_household_name'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const visits = pgTable('visits', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id').notNull().references(() => households.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  contactStatus: text('contact_status', { enum: ['answered', 'not_home', 'refused'] }).notNull(),
  interestLevel: text('interest_level', { enum: ['interested', 'not_interested', 'maybe'] }),
  notes: text('notes'),
  followUpAt: timestamp('follow_up_at'),
  saleOutcome: text('sale_outcome', { enum: ['sold', 'not_sold', 'follow_up'] }),
  productId: uuid('product_id').references(() => products.id),
  installDate: timestamp('install_date'),
  serviceDate: timestamp('service_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Type exports
export type User = typeof users.$inferSelect
export type Team = typeof teams.$inferSelect
export type Product = typeof products.$inferSelect
export type Neighborhood = typeof neighborhoods.$inferSelect
export type House = typeof houses.$inferSelect
export type Household = typeof households.$inferSelect
export type Visit = typeof visits.$inferSelect

// HouseRow is the UI-facing type: location extracted to lat/lng by GET routes
export type HouseRow = Omit<House, 'location'> & { lat: number; lng: number }
```

- [ ] **Step 2: Update `lib/db/schema.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { users, teams, products, neighborhoods, houses, households, visits, accounts, sessions } from './schema'

describe('schema', () => {
  it('users table has required columns', () => {
    expect(users.id).toBeDefined()
    expect(users.email).toBeDefined()
    expect(users.role).toBeDefined()
    expect(users.teamId).toBeDefined()
  })

  it('visits table has required columns', () => {
    expect(visits.householdId).toBeDefined()
    expect(visits.contactStatus).toBeDefined()
    expect(visits.saleOutcome).toBeDefined()
    expect(visits.productId).toBeDefined()
  })

  it('houses table has structured address columns', () => {
    expect(houses.number).toBeDefined()
    expect(houses.street).toBeDefined()
    expect(houses.city).toBeDefined()
    expect(houses.region).toBeDefined()
    expect(houses.postcode).toBeDefined()
    expect(houses.location).toBeDefined()
    expect(houses.externalId).toBeDefined()
  })

  it('houses table has legal flag columns', () => {
    expect(houses.doNotKnock).toBeDefined()
    expect(houses.noSolicitingSign).toBeDefined()
  })
})
```

- [ ] **Step 3: Run schema tests to verify they pass**

```bash
npm run test:run -- lib/db/schema.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 4: Create `lib/db/migrations/0002_houses_structured_fields.sql`**

```sql
-- Clear existing house data (no legacy data — safe to truncate)
TRUNCATE "houses" CASCADE;
--> statement-breakpoint
ALTER TABLE "houses" DROP COLUMN "address";
--> statement-breakpoint
ALTER TABLE "houses" DROP COLUMN "lat";
--> statement-breakpoint
ALTER TABLE "houses" DROP COLUMN "lng";
--> statement-breakpoint
ALTER TABLE "houses" ADD COLUMN "number" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "houses" ADD COLUMN "street" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "houses" ADD COLUMN "unit" text;
--> statement-breakpoint
ALTER TABLE "houses" ADD COLUMN "city" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "houses" ADD COLUMN "region" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "houses" ADD COLUMN "postcode" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "houses" ADD COLUMN "external_id" text;
--> statement-breakpoint
ALTER TABLE "houses" ADD COLUMN "location" geometry(Point, 4326) NOT NULL;
--> statement-breakpoint
ALTER TABLE "houses" ADD CONSTRAINT "houses_external_id_unique" UNIQUE("external_id");
```

- [ ] **Step 5: Apply the migration**

```bash
npx drizzle-kit migrate
```

Expected output: migration `0002_houses_structured_fields` applied successfully.

If drizzle-kit reports a checksum mismatch (because the migration was written manually rather than generated), run:

```bash
npx drizzle-kit push
```

This pushes the schema diff directly without the migration file. After pushing, verify the table structure in Neon console or by running `\d houses` via psql.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts lib/db/schema.test.ts lib/db/migrations/0002_houses_structured_fields.sql
git commit -m "feat: replace address/lat/lng with structured fields and PostGIS point on houses"
```

---

## Task 2: `lib/houses.ts` — formatAddress Helper

**Files:**
- Create: `lib/houses.ts`
- Create: `lib/houses.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/houses.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatAddress } from './houses'

describe('formatAddress', () => {
  it('formats a full address with unit', () => {
    const result = formatAddress({
      number: '376',
      street: 'S 800 East St',
      unit: '2B',
      city: 'Payson',
      region: 'UT',
      postcode: '84651',
    })
    expect(result).toBe('376 S 800 East St, Unit 2B, Payson, UT 84651')
  })

  it('formats an address without unit', () => {
    const result = formatAddress({
      number: '560',
      street: 'S 600 West St',
      unit: null,
      city: 'Payson',
      region: 'UT',
      postcode: '84651',
    })
    expect(result).toBe('560 S 600 West St, Payson, UT 84651')
  })

  it('formats an address with empty string unit the same as null unit', () => {
    const result = formatAddress({
      number: '560',
      street: 'S 600 West St',
      unit: '',
      city: 'Payson',
      region: 'UT',
      postcode: '84651',
    })
    expect(result).toBe('560 S 600 West St, Payson, UT 84651')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- lib/houses.test.ts
```

Expected: FAIL — `Cannot find module './houses'`

- [ ] **Step 3: Create `lib/houses.ts`**

```typescript
export function formatAddress(house: {
  number: string
  street: string
  unit: string | null | undefined
  city: string
  region: string
  postcode: string
}): string {
  const line1 = `${house.number} ${house.street}`
  const line2 = house.unit ? `Unit ${house.unit}` : null
  const line3 = `${house.city}, ${house.region} ${house.postcode}`
  return [line1, line2, line3].filter(Boolean).join(', ')
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run -- lib/houses.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/houses.ts lib/houses.test.ts
git commit -m "feat: add formatAddress helper"
```

---

## Task 3: `lib/mapbox.ts` — Updated geocodeAddress + reverseGeocode

**Files:**
- Modify: `lib/mapbox.ts`
- Create: `lib/mapbox.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/mapbox.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'

// Set token before importing module
process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'test-token'

import { geocodeAddress, reverseGeocode } from './mapbox'

const mockFeature = {
  address: '376',
  text: 'S 800 East St',
  geometry: { coordinates: [-111.7197941, 40.0389676] },
  context: [
    { id: 'postcode.abc', text: '84651' },
    { id: 'place.abc', text: 'Payson' },
    { id: 'region.abc', text: 'Utah', short_code: 'US-UT' },
  ],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('geocodeAddress', () => {
  it('returns structured fields from Mapbox response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [mockFeature] }),
    }))

    const result = await geocodeAddress('376 S 800 East St, Payson, UT 84651')

    expect(result).toEqual({
      lat: 40.0389676,
      lng: -111.7197941,
      number: '376',
      street: 'S 800 East St',
      city: 'Payson',
      region: 'UT',
      postcode: '84651',
    })
  })

  it('returns null when Mapbox returns no features', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    }))

    const result = await geocodeAddress('nonexistent address')
    expect(result).toBeNull()
  })

  it('returns null when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    const result = await geocodeAddress('any address')
    expect(result).toBeNull()
  })
})

describe('reverseGeocode', () => {
  it('returns structured fields from coordinates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [mockFeature] }),
    }))

    const result = await reverseGeocode(40.0389676, -111.7197941)

    expect(result).toEqual({
      lat: 40.0389676,
      lng: -111.7197941,
      number: '376',
      street: 'S 800 East St',
      city: 'Payson',
      region: 'UT',
      postcode: '84651',
    })
  })

  it('returns null when no features found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    }))

    const result = await reverseGeocode(0, 0)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- lib/mapbox.test.ts
```

Expected: FAIL — `reverseGeocode is not exported` and geocodeAddress returns wrong shape.

- [ ] **Step 3: Update `lib/mapbox.ts`**

```typescript
export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

export type GeocodeResult = {
  lat: number
  lng: number
  number: string
  street: string
  city: string
  region: string
  postcode: string
}

function parseFeature(feature: Record<string, unknown>): GeocodeResult | null {
  if (!feature) return null
  const coords = (feature.geometry as { coordinates: number[] })?.coordinates
  if (!coords) return null

  const context = (feature.context as { id: string; text: string; short_code?: string }[]) ?? []
  const postcode = context.find(c => c.id.startsWith('postcode.'))?.text ?? ''
  const city = context.find(c => c.id.startsWith('place.'))?.text ?? ''
  const regionRaw = context.find(c => c.id.startsWith('region.'))?.short_code ?? ''
  const region = regionRaw.startsWith('US-') ? regionRaw.slice(3) : regionRaw

  return {
    lng: coords[0],
    lat: coords[1],
    number: (feature.address as string) ?? '',
    street: (feature.text as string) ?? '',
    city,
    region,
    postcode,
  }
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const feature = data.features?.[0]
  return parseFeature(feature)
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=address&access_token=${MAPBOX_TOKEN}&limit=1`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const feature = data.features?.[0]
  return parseFeature(feature)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- lib/mapbox.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/mapbox.ts lib/mapbox.test.ts
git commit -m "feat: update geocodeAddress to return structured fields, add reverseGeocode"
```

---

## Task 4: GeoJSON Import Route

**Files:**
- Create: `app/api/houses/import/geojson/route.ts`

- [ ] **Step 1: Create `app/api/houses/import/geojson/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { houses } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql } from 'drizzle-orm'

const BATCH_SIZE = 500

type AddressRecord = {
  number: string
  street: string
  unit: string
  city: string
  region: string
  postcode: string
  externalId: string
  lng: number
  lat: number
}

function parseFeatureLine(line: string): AddressRecord | null {
  try {
    const feature = JSON.parse(line)
    if (feature?.type !== 'Feature') return null
    const props = feature.properties ?? {}
    const coords = feature.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) return null
    if (!props.number || !props.street) return null

    return {
      number: String(props.number),
      street: String(props.street),
      unit: String(props.unit ?? ''),
      city: String(props.city ?? ''),
      region: String(props.region ?? ''),
      postcode: String(props.postcode ?? ''),
      externalId: String(props.hash ?? ''),
      lng: Number(coords[0]),
      lat: Number(coords[1]),
    }
  } catch {
    return null
  }
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager')

  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const text = await file.text()
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  const records: AddressRecord[] = []
  let skipped = 0

  for (const line of lines) {
    const record = parseFeatureLine(line)
    if (record) {
      records.push(record)
    } else {
      skipped++
    }
  }

  let imported = 0

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(async (r) => {
        const neighborhoodResult = await db.execute(
          sql`SELECT id FROM neighborhoods
              WHERE ST_Within(ST_SetSRID(ST_Point(${r.lng}, ${r.lat}), 4326), boundary)
              LIMIT 1`
        )
        const neighborhoodId = neighborhoodResult.rows[0]?.id as string | null

        const [house] = await db.insert(houses).values({
          number: r.number,
          street: r.street,
          unit: r.unit || null,
          city: r.city,
          region: r.region,
          postcode: r.postcode,
          externalId: r.externalId || null,
          location: sql`ST_SetSRID(ST_Point(${r.lng}, ${r.lat}), 4326)`,
          neighborhoodId,
        }).onConflictDoNothing().returning()

        return house ?? null
      })
    )

    imported += results.filter(r => r.status === 'fulfilled' && r.value).length
  }

  return NextResponse.json({ imported, skipped, total: lines.length })
})
```

- [ ] **Step 2: Run the full test suite to verify nothing broke**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/houses/import/geojson/route.ts
git commit -m "feat: add GeoJSON bulk import route for OpenAddresses data"
```

---

## Task 5: Update CSV Import Route

**Files:**
- Modify: `app/api/houses/import/route.ts`

- [ ] **Step 1: Update `app/api/houses/import/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { houses } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { geocodeAddress } from '@/lib/mapbox'
import { sql } from 'drizzle-orm'

const BATCH_SIZE = 10

async function processAddress(address: string) {
  const result = await geocodeAddress(address)
  if (!result) return null

  const neighborhoodResult = await db.execute(
    sql`SELECT id FROM neighborhoods
        WHERE ST_Within(ST_SetSRID(ST_Point(${result.lng}, ${result.lat}), 4326), boundary)
        LIMIT 1`
  )
  const neighborhoodId = neighborhoodResult.rows[0]?.id as string | null

  const [house] = await db.insert(houses).values({
    number: result.number,
    street: result.street,
    unit: null,
    city: result.city,
    region: result.region,
    postcode: result.postcode,
    externalId: null,
    location: sql`ST_SetSRID(ST_Point(${result.lng}, ${result.lat}), 4326)`,
    neighborhoodId,
  }).onConflictDoNothing().returning()

  return house ?? null
}

// Expects multipart form with a CSV file
// CSV format: one full address per line, no header required
export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager')
  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const text = await file.text()
  const addresses = text.split('\n').map(l => l.trim()).filter(Boolean)

  let imported = 0
  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    const batch = addresses.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(batch.map(processAddress))
    imported += results.filter(r => r.status === 'fulfilled' && r.value).length
  }

  return NextResponse.json({ imported, total: addresses.length })
})
```

- [ ] **Step 2: Run the full test suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/houses/import/route.ts
git commit -m "feat: update CSV import to use structured geocode result"
```

---

## Task 6: Update API Routes (POST + GET + PATCH)

**Files:**
- Modify: `app/api/houses/route.ts`
- Modify: `app/api/houses/[id]/route.ts`

- [ ] **Step 1: Update `app/api/houses/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { houses } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql } from 'drizzle-orm'

// All columns table-qualified to avoid ambiguity when JOIN is added
const HOUSE_COLS = sql`
  houses.id, houses.number, houses.street, houses.unit,
  houses.city, houses.region, houses.postcode,
  houses.external_id as "externalId",
  ST_Y(houses.location) as lat, ST_X(houses.location) as lng,
  houses.neighborhood_id as "neighborhoodId",
  houses.do_not_knock as "doNotKnock",
  houses.no_soliciting_sign as "noSolicitingSign",
  houses.created_at as "createdAt"
`

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { role, teamId } = session!.user!
  const { searchParams } = new URL(req.url)
  const neighborhoodId = searchParams.get('neighborhoodId')

  if (role === 'admin') {
    const query = neighborhoodId
      ? sql`SELECT ${HOUSE_COLS} FROM houses WHERE houses.neighborhood_id = ${neighborhoodId}`
      : sql`SELECT ${HOUSE_COLS} FROM houses`
    const rows = await db.execute(query)
    return NextResponse.json(rows.rows)
  }

  if (!teamId) return NextResponse.json([])

  const query = neighborhoodId
    ? sql`SELECT ${HOUSE_COLS} FROM houses
          JOIN neighborhoods n ON houses.neighborhood_id = n.id
          WHERE n.team_id = ${teamId} AND houses.neighborhood_id = ${neighborhoodId}`
    : sql`SELECT ${HOUSE_COLS} FROM houses
          JOIN neighborhoods n ON houses.neighborhood_id = n.id
          WHERE n.team_id = ${teamId}`
  const rows = await db.execute(query)
  return NextResponse.json(rows.rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const body = await req.json()

  if (!body.number) return NextResponse.json({ error: 'number required' }, { status: 400 })
  if (!body.street) return NextResponse.json({ error: 'street required' }, { status: 400 })
  if (!body.city) return NextResponse.json({ error: 'city required' }, { status: 400 })
  if (!body.region) return NextResponse.json({ error: 'region required' }, { status: 400 })
  if (!body.postcode) return NextResponse.json({ error: 'postcode required' }, { status: 400 })
  if (body.lat == null) return NextResponse.json({ error: 'lat required' }, { status: 400 })
  if (body.lng == null) return NextResponse.json({ error: 'lng required' }, { status: 400 })

  const { number, street, unit, city, region, postcode, lat, lng } = body

  const neighborhoodResult = await db.execute(
    sql`SELECT id FROM neighborhoods
        WHERE ST_Within(ST_SetSRID(ST_Point(${lng}, ${lat}), 4326), boundary)
        LIMIT 1`
  )
  const neighborhoodId = neighborhoodResult.rows[0]?.id ?? null

  const [house] = await db.insert(houses).values({
    number,
    street,
    unit: unit || null,
    city,
    region,
    postcode,
    externalId: null,
    location: sql`ST_SetSRID(ST_Point(${lng}, ${lat}), 4326)`,
    neighborhoodId: neighborhoodId as string | null,
  }).returning()

  return NextResponse.json(house, { status: 201 })
})
```

- [ ] **Step 2: Update `app/api/houses/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { houses } from '@/lib/db/schema'
import { requireRole, canSetDoNotKnock } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { eq } from 'drizzle-orm'

export const PATCH = withErrorHandling(async (req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { id } = await params
  const body = await req.json()
  const role = session!.user!.role

  const updates: Partial<typeof houses.$inferInsert> = {}
  if (body.noSolicitingSign !== undefined) updates.noSolicitingSign = body.noSolicitingSign
  if (body.doNotKnock !== undefined) {
    if (!canSetDoNotKnock(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    updates.doNotKnock = body.doNotKnock
  }

  const [house] = await db.update(houses).set(updates).where(eq(houses.id, id)).returning()
  if (!house) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(house)
})
```

- [ ] **Step 3: Run the full test suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/houses/route.ts app/api/houses/[id]/route.ts
git commit -m "feat: update houses API routes for structured address fields"
```

---

## Task 7: UI Updates

**Files:**
- Modify: `components/forms/HouseForm.tsx`
- Modify: `components/map/MapShell.tsx`
- Modify: `components/map/HousePanel.tsx`
- Modify: `components/map/HousePins.tsx`
- Modify: `components/map/MapView.tsx`

- [ ] **Step 1: Update `components/forms/HouseForm.tsx`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { reverseGeocode } from '@/lib/mapbox'

export type HouseFormData = {
  number: string
  street: string
  unit: string
  city: string
  region: string
  postcode: string
}

type Props = {
  lat: number
  lng: number
  onSubmit: (data: HouseFormData) => Promise<void>
  onCancel: () => void
}

export function HouseForm({ lat, lng, onSubmit, onCancel }: Props) {
  const [fields, setFields] = useState<HouseFormData>({
    number: '', street: '', unit: '', city: '', region: '', postcode: '',
  })
  const [loading, setLoading] = useState(false)
  const [geocoding, setGeocoding] = useState(true)

  useEffect(() => {
    reverseGeocode(lat, lng).then(result => {
      if (result) {
        setFields({
          number: result.number,
          street: result.street,
          unit: '',
          city: result.city,
          region: result.region,
          postcode: result.postcode,
        })
      }
      setGeocoding(false)
    })
  }, [lat, lng])

  function set(key: keyof HouseFormData) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setFields(f => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!fields.number.trim() || !fields.street.trim()) return
    setLoading(true)
    await onSubmit(fields)
    setLoading(false)
  }

  const isValid = fields.number.trim() && fields.street.trim() && fields.city.trim() && fields.postcode.trim()

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Pin dropped at {lat.toFixed(5)}, {lng.toFixed(5)}
      </p>
      {geocoding && <p className="text-sm text-muted-foreground">Looking up address…</p>}
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1">
          <Label>Number</Label>
          <Input value={fields.number} onChange={set('number')} placeholder="376" />
        </div>
        <div className="col-span-2">
          <Label>Street</Label>
          <Input value={fields.street} onChange={set('street')} placeholder="S 800 East St" />
        </div>
      </div>
      <div>
        <Label>Unit <span className="text-muted-foreground">(optional)</span></Label>
        <Input value={fields.unit} onChange={set('unit')} placeholder="Apt 2B" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1">
          <Label>City</Label>
          <Input value={fields.city} onChange={set('city')} placeholder="Payson" />
        </div>
        <div className="col-span-1">
          <Label>State</Label>
          <Input value={fields.region} onChange={set('region')} placeholder="UT" maxLength={2} />
        </div>
        <div className="col-span-1">
          <Label>Zip</Label>
          <Input value={fields.postcode} onChange={set('postcode')} placeholder="84651" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={loading || !isValid} className="flex-1">
          {loading ? 'Adding…' : 'Add House'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Update `components/map/MapShell.tsx`**

```tsx
'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { HousePanel } from './HousePanel'
import { HouseForm, type HouseFormData } from '@/components/forms/HouseForm'
import type { HouseRow, Neighborhood } from '@/lib/db/schema'

const MapView = dynamic(() => import('./MapView'), { ssr: false })

type Props = {
  neighborhoods: (Neighborhood & { boundary: GeoJSON.Polygon })[]
  houses: (HouseRow & { lastOutcome?: string | null })[]
  userRole: string
}

export function MapShell({ neighborhoods, houses, userRole }: Props) {
  const router = useRouter()
  const [selectedHouse, setSelectedHouse] = useState<HouseRow | null>(null)
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  async function handleAddHouse(data: HouseFormData) {
    if (!pendingLocation) return
    setAddError(null)
    const res = await fetch('/api/houses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, lat: pendingLocation.lat, lng: pendingLocation.lng }),
    })
    if (!res.ok) {
      setAddError('Failed to add house. Please try again.')
      return
    }
    setPendingLocation(null)
    router.refresh()
  }

  return (
    <div className="relative h-[calc(100vh-56px)] w-full">
      <MapView
        neighborhoods={neighborhoods}
        houses={houses}
        onHouseClick={house => setSelectedHouse(house)}
        onMapClick={(lat, lng) => {
          setSelectedHouse(null)
          setPendingLocation({ lat, lng })
        }}
      />
      <HousePanel
        house={selectedHouse}
        userRole={userRole}
        onClose={() => setSelectedHouse(null)}
      />
      <Sheet open={!!pendingLocation} onOpenChange={(open: boolean) => !open && setPendingLocation(null)}>
        <SheetContent side="bottom" className="h-auto">
          <SheetHeader>
            <SheetTitle>Add House</SheetTitle>
          </SheetHeader>
          {addError && (
            <p className="mt-2 text-sm text-destructive">{addError}</p>
          )}
          {pendingLocation && (
            <div className="mt-4">
              <HouseForm
                lat={pendingLocation.lat}
                lng={pendingLocation.lng}
                onSubmit={handleAddHouse}
                onCancel={() => setPendingLocation(null)}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
```

- [ ] **Step 3: Update `components/map/HousePanel.tsx`**

Replace the entire file with:

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { VisitForm, type VisitFormData } from '@/components/forms/VisitForm'
import { HouseholdForm } from '@/components/forms/HouseholdForm'
import type { HouseRow } from '@/lib/db/schema'
import { formatAddress } from '@/lib/houses'

type Household = { id: string; surname: string | null; headOfHouseholdName: string | null; active: boolean; createdAt: string }
type Visit = { id: string; contactStatus: string; interestLevel: string | null; saleOutcome: string | null; notes: string | null; createdAt: string }
type Product = { id: string; name: string }

type Props = {
  house: HouseRow | null
  userRole: string
  onClose: () => void
}

type View = 'detail' | 'log-visit' | 'new-household'

export function HousePanel({ house, userRole, onClose }: Props) {
  const [view, setView] = useState<View>('detail')
  const [households, setHouseholds] = useState<Household[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeHousehold = households.find(h => h.active)

  const fetchData = useCallback(async () => {
    if (!house) return
    setLoading(true)
    setError(null)
    try {
      const [hRes, pRes] = await Promise.all([
        fetch(`/api/households?houseId=${house.id}`),
        fetch('/api/products'),
      ])
      if (!hRes.ok) throw new Error('Failed to load household data')
      if (!pRes.ok) throw new Error('Failed to load products')

      const hh: Household[] = await hRes.json()
      setHouseholds(hh)
      setProducts(await pRes.json())

      const active = hh.find(h => h.active)
      if (active) {
        const vRes = await fetch(`/api/visits?householdId=${active.id}`)
        if (!vRes.ok) throw new Error('Failed to load visit history')
        setVisits(await vRes.json())
      } else {
        setVisits([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [house])

  useEffect(() => {
    if (!house) return
    setView('detail')
    fetchData()
  }, [house?.id, fetchData])

  async function handleLogVisit(data: VisitFormData) {
    const res = await fetch('/api/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      setError('Failed to save visit. Please try again.')
      return
    }
    setView('detail')
    fetchData()
  }

  async function handleNewHousehold(data: { houseId: string; surname: string; headOfHouseholdName: string }) {
    const res = await fetch('/api/households', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      setError('Failed to save household. Please try again.')
      return
    }
    setView('detail')
    fetchData()
  }

  async function handleFlagToggle(field: 'noSolicitingSign' | 'doNotKnock') {
    if (!house) return
    const confirmed = window.confirm('Are you sure you want to toggle this flag? This will warn all reps.')
    if (!confirmed) return
    const res = await fetch(`/api/houses/${house.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: !house[field] }),
    })
    if (!res.ok) {
      setError('Failed to update flag. Please try again.')
      return
    }
    fetchData()
  }

  if (!house) return null

  const isFlagged = house.doNotKnock || house.noSolicitingSign

  return (
    <Sheet open={!!house} onOpenChange={(open: boolean) => !open && onClose()}>
      <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">
            {formatAddress(house)}
            {isFlagged && <Badge variant="destructive" className="ml-2">Flagged</Badge>}
          </SheetTitle>
        </SheetHeader>

        {error && (
          <div className="my-3 rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {isFlagged && (
          <div className="my-3 rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {house.doNotKnock && <p>⚠️ Do Not Knock — this address is on a no-contact list.</p>}
            {house.noSolicitingSign && <p>⚠️ No Soliciting sign observed on property.</p>}
          </div>
        )}

        {view === 'detail' && (
          <div className="mt-4 space-y-4">
            {activeHousehold && (
              <div>
                <p className="text-sm font-medium">Current household: {activeHousehold.surname ?? 'Unknown'}</p>
                {activeHousehold.headOfHouseholdName && (
                  <p className="text-sm text-muted-foreground">{activeHousehold.headOfHouseholdName}</p>
                )}
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={() => {
                if (isFlagged) {
                  if (!window.confirm('This house is flagged. Are you sure you want to log a visit?')) return
                }
                setView('log-visit')
              }}>
                Log Visit
              </Button>
              <Button size="sm" variant="outline" onClick={() => setView('new-household')}>
                New Family Moved In
              </Button>
              {userRole === 'rep' && (
                <Button size="sm" variant="outline" onClick={() => handleFlagToggle('noSolicitingSign')}>
                  {house.noSolicitingSign ? 'Clear No Soliciting' : 'Mark No Soliciting Sign'}
                </Button>
              )}
              {(userRole === 'admin' || userRole === 'manager') && (
                <Button size="sm" variant="outline" onClick={() => handleFlagToggle('doNotKnock')}>
                  {house.doNotKnock ? 'Clear Do Not Knock' : 'Mark Do Not Knock'}
                </Button>
              )}
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Visit History</h3>
                {visits.length === 0 && <p className="text-sm text-muted-foreground">No visits yet.</p>}
                {visits.map(v => (
                  <div key={v.id} className="rounded border p-3 text-sm">
                    <div className="flex justify-between">
                      <Badge variant="outline">{v.contactStatus}</Badge>
                      <span className="text-muted-foreground">{new Date(v.createdAt).toLocaleDateString()}</span>
                    </div>
                    {v.saleOutcome && <p className="mt-1">Outcome: <strong>{v.saleOutcome}</strong></p>}
                    {v.notes && <p className="mt-1 text-muted-foreground">{v.notes}</p>}
                  </div>
                ))}

                {households.filter(h => !h.active).length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold text-muted-foreground">Previous Households</h3>
                    {households.filter(h => !h.active).map(h => (
                      <p key={h.id} className="text-sm text-muted-foreground">
                        {h.surname ?? 'Unknown'} — since {new Date(h.createdAt).toLocaleDateString()}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {view === 'log-visit' && activeHousehold && (
          <div className="mt-4">
            <VisitForm
              householdId={activeHousehold.id}
              products={products}
              onSubmit={handleLogVisit}
              onCancel={() => setView('detail')}
            />
          </div>
        )}

        {view === 'new-household' && (
          <div className="mt-4">
            <HouseholdForm
              houseId={house.id}
              onSubmit={handleNewHousehold}
              onCancel={() => setView('detail')}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 4: Update `components/map/HousePins.tsx`**

Change the import from `House` to `HouseRow`:

```tsx
'use client'
import { Source, Layer } from 'react-map-gl/mapbox'
import type { HouseRow } from '@/lib/db/schema'

function pinColor(house: HouseRow & { lastOutcome?: string | null }): string {
  if (house.doNotKnock || house.noSolicitingSign) return '#000000'
  switch (house.lastOutcome) {
    case 'sold': return '#22c55e'
    case 'interested': case 'maybe': return '#eab308'
    case 'not_interested': case 'refused': return '#ef4444'
    default: return '#9ca3af'
  }
}

type HouseWithOutcome = HouseRow & { lastOutcome?: string | null }

type Props = {
  houses: HouseWithOutcome[]
  onHouseClick: (house: HouseWithOutcome) => void
}

export function HousePins({ houses, onHouseClick }: Props) {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: houses.map(h => ({
      type: 'Feature',
      id: h.id,
      geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
      properties: {
        id: h.id,
        color: pinColor(h),
        flagged: h.doNotKnock || h.noSolicitingSign,
      },
    })),
  }

  return (
    <Source id="houses" type="geojson" data={geojson}>
      <Layer
        id="house-circles"
        type="circle"
        paint={{
          'circle-color': ['get', 'color'],
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        }}
      />
    </Source>
  )
}
```

- [ ] **Step 5: Update `components/map/MapView.tsx`**

Change the import and prop type from `House` to `HouseRow`:

```tsx
'use client'
import Map, { NavigationControl } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAPBOX_TOKEN } from '@/lib/mapbox'
import { NeighborhoodLayer } from './NeighborhoodLayer'
import { HousePins } from './HousePins'
import { useState, useEffect } from 'react'
import type { HouseRow, Neighborhood } from '@/lib/db/schema'
import MapStyleToggle, { MapStyle, MAP_STYLE_URLS } from './MapStyleToggle'

type Props = {
  neighborhoods: (Neighborhood & { boundary: GeoJSON.Polygon })[]
  houses: HouseRow[]
  onHouseClick: (house: HouseRow) => void
  onMapClick?: (lat: number, lng: number) => void
}

export default function MapView({ neighborhoods, houses, onHouseClick, onMapClick }: Props) {
  const [viewport, setViewport] = useState({
    longitude: -98.5795,
    latitude: 39.8283,
    zoom: 10,
  })
  const [mapStyle, setMapStyle] = useState<MapStyle>('streets')

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      pos => setViewport(v => ({ ...v, longitude: pos.coords.longitude, latitude: pos.coords.latitude, zoom: 13 })),
      () => {}
    )
  }, [])

  return (
    <Map
      {...viewport}
      onMove={e => setViewport(e.viewState)}
      mapboxAccessToken={MAPBOX_TOKEN}
      mapStyle={MAP_STYLE_URLS[mapStyle]}
      style={{ width: '100%', height: '100%' }}
      interactiveLayerIds={['house-circles']}
      onClick={e => {
        const feature = e.features?.[0]
        if (feature?.layer?.id === 'house-circles') {
          const house = houses.find(h => h.id === feature.properties?.id)
          if (house) { onHouseClick(house); return }
        }
        onMapClick?.(e.lngLat.lat, e.lngLat.lng)
      }}
    >
      <NavigationControl position="top-right" />
      <NeighborhoodLayer neighborhoods={neighborhoods} />
      <HousePins houses={houses} onHouseClick={onHouseClick} />
      <MapStyleToggle value={mapStyle} onChange={setMapStyle} />
    </Map>
  )
}
```

- [ ] **Step 6: Run the full test suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/forms/HouseForm.tsx components/map/MapShell.tsx components/map/HousePanel.tsx components/map/HousePins.tsx components/map/MapView.tsx
git commit -m "feat: update UI components for structured address fields"
```
