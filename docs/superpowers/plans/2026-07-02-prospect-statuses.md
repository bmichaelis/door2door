# Prospect Statuses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-tap settable status on houses and businesses with an admin-customizable status list; map pins colored by status; visits auto-set a mapped status.

**Architecture:** New `statuses` table with five seeded "system" rows carrying an `autoKey` that the visit-logging code maps outcomes onto; `statusId` FK on `houses` and `businesses` becomes the single source of pin color (replacing the derived `lastOutcome`). Server-side auto-set on visit POST; one-tap chips in the map panels; admin CRUD page.

**Tech Stack:** Next.js 15 App Router (edge runtime) on Cloudflare Pages, Neon Postgres + PostGIS, Drizzle ORM (hand-written SQL migrations), NextAuth v5, Mapbox GL via react-map-gl, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-02-prospect-statuses-design.md`

## Global Constraints

- Every API route file starts with `export const runtime = 'edge'`.
- Code style: no semicolons, single quotes, 2-space indent (match neighboring files).
- Migrations are hand-written SQL in `lib/db/migrations/` plus a manual entry appended to `lib/db/migrations/meta/_journal.json`.
- `@/` path alias for imports.
- This Next.js version has breaking changes vs training data — check `node_modules/next/dist/docs/` before using unfamiliar Next APIs (per AGENTS.md).
- Run tests with `npm run test:run` (all) or `npm run test:run -- <file>` (one file).
- Commit after every task; reference issue `#2` in commit bodies where noted.
- To run `npm run db:migrate` from this worktree you need `.env.local`: `cp /home/ubuntu/repos/door2door/.env.local .env.local` (it's gitignored; the worktree doesn't have it).

---

### Task 1: Schema — `statuses` table, `statusId` columns, migration with seed + backfill

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/schema.test.ts`
- Create: `lib/db/migrations/0009_prospect_statuses.sql`
- Modify: `lib/db/migrations/meta/_journal.json`

**Interfaces:**
- Produces: `statuses` Drizzle table (columns `id`, `name`, `color`, `sortOrder`, `active`, `autoKey`, `createdAt`), `houses.statusId`, `businesses.statusId`, and the exported type `Status`. Later tasks import `{ statuses }` and `type Status` from `@/lib/db/schema`.

- [ ] **Step 1: Write the failing tests**

Add to the bottom of the `describe('schema', ...)` block in `lib/db/schema.test.ts`, and add `statuses`, `businesses` to the existing import from `./schema`:

```ts
  it('statuses table has required columns', () => {
    expect(statuses.id).toBeDefined()
    expect(statuses.name).toBeDefined()
    expect(statuses.color).toBeDefined()
    expect(statuses.sortOrder).toBeDefined()
    expect(statuses.active).toBeDefined()
    expect(statuses.autoKey).toBeDefined()
    expect((statuses.sortOrder as { name: string }).name).toBe('sort_order')
    expect((statuses.autoKey as { name: string }).name).toBe('auto_key')
  })

  it('houses and businesses have statusId column', () => {
    expect(houses.statusId).toBeDefined()
    expect((houses.statusId as { name: string }).name).toBe('status_id')
    expect(businesses.statusId).toBeDefined()
    expect((businesses.statusId as { name: string }).name).toBe('status_id')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- lib/db/schema.test.ts`
Expected: FAIL — `statuses` is not exported / `houses.statusId` undefined.

- [ ] **Step 3: Add the table and columns to `lib/db/schema.ts`**

Insert after the `products` table definition (before `neighborhoods`):

```ts
export const statuses = pgTable('statuses', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(), // hex, e.g. #22c55e
  sortOrder: integer('sort_order').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  // System rows carry an autoKey targeted by visit auto-set; they can be
  // renamed/recolored but not deleted or deactivated. Custom rows: autoKey null.
  autoKey: text('auto_key', {
    enum: ['not_home', 'interested', 'callback', 'customer', 'not_interested'],
  }).unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

In the `houses` table, add after `noSolicitingSign`:

```ts
  statusId: uuid('status_id').references(() => statuses.id, { onDelete: 'set null' }),
```

In the `businesses` table, add after `neighborhoodId`:

```ts
  statusId: uuid('status_id').references(() => statuses.id, { onDelete: 'set null' }),
```

In the type exports at the bottom, add:

```ts
export type Status = typeof statuses.$inferSelect
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- lib/db/schema.test.ts`
Expected: PASS (all tests, including pre-existing ones).

- [ ] **Step 5: Write the migration**

Create `lib/db/migrations/0009_prospect_statuses.sql`. The seed colors intentionally match the current derived pin colors in `HousePins.pinColor`. The backfill maps each house/business's most recent visit through the same rules the runtime auto-set will use (Task 2), so the map looks the same on ship day.

```sql
CREATE TABLE IF NOT EXISTS "statuses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "color" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "auto_key" text UNIQUE,
  "created_at" timestamp DEFAULT now() NOT NULL
);

INSERT INTO "statuses" ("name", "color", "sort_order", "auto_key") VALUES
  ('Not Home',       '#94a3b8', 1, 'not_home'),
  ('Interested',     '#eab308', 2, 'interested'),
  ('Callback',       '#3b82f6', 3, 'callback'),
  ('Customer',       '#22c55e', 4, 'customer'),
  ('Not Interested', '#ef4444', 5, 'not_interested')
ON CONFLICT ("auto_key") DO NOTHING;

ALTER TABLE "houses" ADD COLUMN IF NOT EXISTS "status_id" uuid REFERENCES "statuses"("id") ON DELETE SET NULL;
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "status_id" uuid REFERENCES "statuses"("id") ON DELETE SET NULL;

-- Backfill houses from each house's most recent visit
WITH last_visits AS (
  SELECT DISTINCT ON (ho.house_id)
    ho.house_id, v.contact_status, v.interest_level, v.sale_outcome, v.follow_up_at
  FROM visits v
  JOIN households ho ON v.household_id = ho.id
  ORDER BY ho.house_id, v.created_at DESC
)
UPDATE houses h SET status_id = s.id
FROM last_visits lv
JOIN statuses s ON s.auto_key = CASE
  WHEN lv.sale_outcome = 'sold' THEN 'customer'
  WHEN lv.sale_outcome = 'follow_up' OR lv.follow_up_at IS NOT NULL THEN 'callback'
  WHEN lv.contact_status = 'refused' OR lv.interest_level = 'not_interested' OR lv.sale_outcome = 'not_sold' THEN 'not_interested'
  WHEN lv.interest_level IN ('interested', 'maybe') THEN 'interested'
  WHEN lv.contact_status = 'not_home' THEN 'not_home'
END
WHERE h.id = lv.house_id AND h.status_id IS NULL;

-- Backfill businesses from each business's most recent visit
WITH last_bvisits AS (
  SELECT DISTINCT ON (bv.business_id)
    bv.business_id, bv.contact_status, bv.interest_level, bv.sale_outcome, bv.follow_up_at
  FROM business_visits bv
  ORDER BY bv.business_id, bv.created_at DESC
)
UPDATE businesses b SET status_id = s.id
FROM last_bvisits lv
JOIN statuses s ON s.auto_key = CASE
  WHEN lv.sale_outcome = 'sold' THEN 'customer'
  WHEN lv.sale_outcome = 'follow_up' OR lv.follow_up_at IS NOT NULL THEN 'callback'
  WHEN lv.contact_status = 'refused' OR lv.interest_level = 'not_interested' OR lv.sale_outcome = 'not_sold' THEN 'not_interested'
  WHEN lv.interest_level IN ('interested', 'maybe') THEN 'interested'
  WHEN lv.contact_status = 'not_home' THEN 'not_home'
END
WHERE b.id = lv.business_id AND b.status_id IS NULL;
```

Note the `CASE` with no `ELSE` yields NULL, which never joins a `statuses` row, so unmatched visits simply don't backfill — same semantics as the runtime "skip silently" rule.

- [ ] **Step 6: Register the migration in the journal**

In `lib/db/migrations/meta/_journal.json`, append to the `entries` array (after the idx 8 entry):

```json
    {
      "idx": 9,
      "version": "7",
      "when": 1782950400000,
      "tag": "0009_prospect_statuses",
      "breakpoints": true
    }
```

- [ ] **Step 7: Apply the migration**

Run (after copying `.env.local` per Global Constraints): `npm run db:migrate`
Expected: exits 0. Verify with a quick check that five rows exist — the easiest is the Neon console, or trust Task 9's end-to-end verification.

- [ ] **Step 8: Commit**

```bash
git add lib/db/schema.ts lib/db/schema.test.ts lib/db/migrations/0009_prospect_statuses.sql lib/db/migrations/meta/_journal.json
git commit -m "feat: statuses table, statusId on houses/businesses, seed + backfill (#2)"
```

---

### Task 2: `lib/statuses.ts` — auto-key mapping and pin color resolution

**Files:**
- Create: `lib/statuses.ts`
- Create: `lib/statuses.test.ts`

**Interfaces:**
- Produces (exact exports later tasks import from `@/lib/statuses`):
  - `type AutoKey = 'not_home' | 'interested' | 'callback' | 'customer' | 'not_interested'`
  - `type StatusOption = { id: string; name: string; color: string; sortOrder: number; active: boolean; autoKey: AutoKey | null }` — the client-safe shape of a status (API JSON serializes `createdAt` to string, so client code uses this, not the Drizzle `Status` type)
  - `visitAutoKey(v: { contactStatus: string; interestLevel?: string | null; saleOutcome?: string | null; followUpAt?: string | Date | null }): AutoKey | null`
  - `pinColor(entity: { doNotKnock?: boolean; noSolicitingSign?: boolean; statusId?: string | null }, colors: Record<string, string>, fallback?: string): string`
  - `DEFAULT_PIN_COLOR = '#9ca3af'`
  - `isValidHexColor(s: string): boolean`

- [ ] **Step 1: Write the failing tests**

Create `lib/statuses.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { visitAutoKey, pinColor, isValidHexColor, DEFAULT_PIN_COLOR } from './statuses'

describe('visitAutoKey', () => {
  it('maps sold to customer', () => {
    expect(visitAutoKey({ contactStatus: 'answered', saleOutcome: 'sold' })).toBe('customer')
  })

  it('sold wins over everything else', () => {
    expect(visitAutoKey({
      contactStatus: 'answered', saleOutcome: 'sold',
      interestLevel: 'not_interested', followUpAt: '2026-07-10T10:00',
    })).toBe('customer')
  })

  it('maps follow_up outcome to callback', () => {
    expect(visitAutoKey({ contactStatus: 'answered', saleOutcome: 'follow_up' })).toBe('callback')
  })

  it('maps a set followUpAt to callback even without outcome', () => {
    expect(visitAutoKey({ contactStatus: 'answered', followUpAt: '2026-07-10T10:00' })).toBe('callback')
  })

  it('callback wins over not_interested signals', () => {
    expect(visitAutoKey({
      contactStatus: 'answered', saleOutcome: 'follow_up', interestLevel: 'not_interested',
    })).toBe('callback')
  })

  it('maps refused to not_interested', () => {
    expect(visitAutoKey({ contactStatus: 'refused' })).toBe('not_interested')
  })

  it('maps not_interested interest to not_interested', () => {
    expect(visitAutoKey({ contactStatus: 'answered', interestLevel: 'not_interested' })).toBe('not_interested')
  })

  it('maps not_sold outcome to not_interested', () => {
    expect(visitAutoKey({ contactStatus: 'answered', saleOutcome: 'not_sold' })).toBe('not_interested')
  })

  it('maps interested and maybe to interested', () => {
    expect(visitAutoKey({ contactStatus: 'answered', interestLevel: 'interested' })).toBe('interested')
    expect(visitAutoKey({ contactStatus: 'answered', interestLevel: 'maybe' })).toBe('interested')
  })

  it('maps not_home to not_home', () => {
    expect(visitAutoKey({ contactStatus: 'not_home' })).toBe('not_home')
  })

  it('returns null for answered with no signals', () => {
    expect(visitAutoKey({ contactStatus: 'answered' })).toBeNull()
  })
})

describe('pinColor', () => {
  const colors = { 'id-1': '#22c55e' }

  it('flags always win', () => {
    expect(pinColor({ doNotKnock: true, statusId: 'id-1' }, colors)).toBe('#000000')
    expect(pinColor({ noSolicitingSign: true, statusId: 'id-1' }, colors)).toBe('#000000')
  })

  it('uses the status color when known', () => {
    expect(pinColor({ statusId: 'id-1' }, colors)).toBe('#22c55e')
  })

  it('falls back to default for null or unknown statusId', () => {
    expect(pinColor({ statusId: null }, colors)).toBe(DEFAULT_PIN_COLOR)
    expect(pinColor({ statusId: 'missing' }, colors)).toBe(DEFAULT_PIN_COLOR)
  })

  it('respects a custom fallback', () => {
    expect(pinColor({ statusId: null }, colors, '#f97316')).toBe('#f97316')
  })
})

describe('isValidHexColor', () => {
  it('accepts 6-digit hex', () => {
    expect(isValidHexColor('#22c55e')).toBe(true)
    expect(isValidHexColor('#ABCDEF')).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isValidHexColor('22c55e')).toBe(false)
    expect(isValidHexColor('#fff')).toBe(false)
    expect(isValidHexColor('#22c55e00')).toBe(false)
    expect(isValidHexColor('red')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- lib/statuses.test.ts`
Expected: FAIL — cannot resolve `./statuses`.

- [ ] **Step 3: Implement `lib/statuses.ts`**

```ts
export type AutoKey = 'not_home' | 'interested' | 'callback' | 'customer' | 'not_interested'

// Client-safe status shape (API JSON serializes createdAt, so UI code uses
// this instead of the Drizzle Status type)
export type StatusOption = {
  id: string
  name: string
  color: string
  sortOrder: number
  active: boolean
  autoKey: AutoKey | null
}

/**
 * Map a logged visit onto the system status it should auto-set.
 * First match wins; returns null when nothing applies (visit logging
 * must never fail because of this).
 */
export function visitAutoKey(v: {
  contactStatus: string
  interestLevel?: string | null
  saleOutcome?: string | null
  followUpAt?: string | Date | null
}): AutoKey | null {
  if (v.saleOutcome === 'sold') return 'customer'
  if (v.saleOutcome === 'follow_up' || v.followUpAt) return 'callback'
  if (v.contactStatus === 'refused' || v.interestLevel === 'not_interested' || v.saleOutcome === 'not_sold') {
    return 'not_interested'
  }
  if (v.interestLevel === 'interested' || v.interestLevel === 'maybe') return 'interested'
  if (v.contactStatus === 'not_home') return 'not_home'
  return null
}

export const DEFAULT_PIN_COLOR = '#9ca3af'

export function pinColor(
  entity: { doNotKnock?: boolean; noSolicitingSign?: boolean; statusId?: string | null },
  colors: Record<string, string>,
  fallback: string = DEFAULT_PIN_COLOR,
): string {
  if (entity.doNotKnock || entity.noSolicitingSign) return '#000000'
  if (entity.statusId && colors[entity.statusId]) return colors[entity.statusId]
  return fallback
}

export function isValidHexColor(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- lib/statuses.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/statuses.ts lib/statuses.test.ts
git commit -m "feat: visit auto-key mapping and status pin color resolution (#2)"
```

---

### Task 3: Statuses API — list/create/update/delete with system-row protection

**Files:**
- Create: `app/api/statuses/route.ts`
- Create: `app/api/statuses/[id]/route.ts`

**Interfaces:**
- Consumes: `statuses` table from Task 1, `isValidHexColor` from Task 2.
- Produces: `GET /api/statuses` → JSON array of all status rows (active and inactive, ordered by `sortOrder`); `POST /api/statuses` (admin) body `{ name, color }`; `PATCH /api/statuses/[id]` (admin) body any of `{ name, color, sortOrder, active }`; `DELETE /api/statuses/[id]` (admin, custom rows only).

There is no route-level test harness in this repo (auth/db are not mockable in vitest today); route logic stays thin and the branching it relies on (`isValidHexColor`) is unit-tested in Task 2. Verification is TypeScript + lint + the Task 9 smoke test.

- [ ] **Step 1: Create `app/api/statuses/route.ts`**

```ts
export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { statuses } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { isValidHexColor } from '@/lib/statuses'
import { sql } from 'drizzle-orm'

export const GET = withErrorHandling(async () => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  // All rows, including inactive: pins still need colors for houses that
  // kept a deactivated status. Clients filter on `active` for the chip row.
  const rows = await db.select().from(statuses).orderBy(statuses.sortOrder, statuses.createdAt)
  return NextResponse.json(rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!body.color || !isValidHexColor(body.color)) {
    return NextResponse.json({ error: 'color must be a 6-digit hex color like #22c55e' }, { status: 400 })
  }
  const next = await db.execute(sql`SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM statuses`)
  const [status] = await db.insert(statuses).values({
    name: body.name,
    color: body.color,
    sortOrder: Number(next.rows[0].next),
  }).returning()
  return NextResponse.json(status, { status: 201 })
})
```

- [ ] **Step 2: Create `app/api/statuses/[id]/route.ts`**

```ts
export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { statuses } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { isValidHexColor } from '@/lib/statuses'
import { eq } from 'drizzle-orm'

export const PATCH = withErrorHandling(async (req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const { id } = await params
  const body = await req.json()

  const [existing] = await db.select().from(statuses).where(eq(statuses.id, id))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (existing.autoKey && body.active === false) {
    return NextResponse.json({ error: 'System statuses cannot be deactivated' }, { status: 400 })
  }
  if (body.color !== undefined && !isValidHexColor(body.color)) {
    return NextResponse.json({ error: 'color must be a 6-digit hex color like #22c55e' }, { status: 400 })
  }

  const updates: Partial<typeof statuses.$inferInsert> = {}
  if (body.name !== undefined) {
    if (!body.name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    updates.name = body.name
  }
  if (body.color !== undefined) updates.color = body.color
  if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder)
  if (body.active !== undefined) updates.active = Boolean(body.active)

  const [status] = await db.update(statuses).set(updates).where(eq(statuses.id, id)).returning()
  return NextResponse.json(status)
})

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const { id } = await params

  const [existing] = await db.select().from(statuses).where(eq(statuses.id, id))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.autoKey) {
    return NextResponse.json({ error: 'System statuses cannot be deleted' }, { status: 400 })
  }

  // FK on houses/businesses is ON DELETE SET NULL — references clear themselves
  await db.delete(statuses).where(eq(statuses.id, id))
  return new NextResponse(null, { status: 204 })
})
```

- [ ] **Step 3: Verify it compiles and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors (pre-existing warnings, if any, are unrelated).

- [ ] **Step 4: Commit**

```bash
git add app/api/statuses
git commit -m "feat: statuses CRUD API with system-row protection (#2)"
```

---

### Task 4: Auto-set status when visits are logged

**Files:**
- Modify: `app/api/visits/route.ts`
- Modify: `app/api/business-visits/route.ts`

**Interfaces:**
- Consumes: `visitAutoKey` from Task 2.
- Produces: `POST /api/visits` response gains `houseStatusId: string | null` (the house's status after any auto-set); `POST /api/business-visits` response gains `businessStatusId: string | null`. Task 7 reads these to update the map without a refetch.

- [ ] **Step 1: Update `app/api/visits/route.ts`**

Add imports: `import { sql } from 'drizzle-orm'` (extend the existing `eq, desc` import line) and `import { visitAutoKey } from '@/lib/statuses'`.

Replace the end of `POST` — the current lines:

```ts
  }).returning()
  return NextResponse.json(visit, { status: 201 })
```

with:

```ts
  }).returning()

  // Auto-set the house status from the visit outcome. Never fail the visit
  // insert over this — visit logging is the critical path.
  let houseStatusId: string | null = null
  try {
    const autoKey = visitAutoKey(body)
    if (autoKey) {
      await db.execute(sql`
        UPDATE houses SET status_id = s.id
        FROM statuses s
        WHERE s.auto_key = ${autoKey}
          AND houses.id = (SELECT house_id FROM households WHERE id = ${body.householdId})
      `)
    }
    const row = await db.execute(sql`
      SELECT h.status_id AS "statusId" FROM houses h
      JOIN households ho ON ho.house_id = h.id
      WHERE ho.id = ${body.householdId}
    `)
    houseStatusId = (row.rows[0]?.statusId as string | undefined) ?? null
  } catch (e) {
    console.error('status auto-set failed', e)
  }

  return NextResponse.json({ ...visit, houseStatusId }, { status: 201 })
```

Note: `UPDATE ... FROM statuses s WHERE s.auto_key = ...` updates zero rows when no status row carries that key — the "skip silently" rule from the spec.

- [ ] **Step 2: Update `app/api/business-visits/route.ts`**

Add imports: `sql` to the drizzle import, and `import { visitAutoKey } from '@/lib/statuses'`.

Replace the end of `POST` — the current lines:

```ts
  }).returning()

  return NextResponse.json(visit)
```

with:

```ts
  }).returning()

  let businessStatusId: string | null = null
  try {
    const autoKey = visitAutoKey(body)
    if (autoKey) {
      await db.execute(sql`
        UPDATE businesses SET status_id = s.id
        FROM statuses s
        WHERE s.auto_key = ${autoKey} AND businesses.id = ${businessId}
      `)
    }
    const row = await db.execute(sql`
      SELECT status_id AS "statusId" FROM businesses WHERE id = ${businessId}
    `)
    businessStatusId = (row.rows[0]?.statusId as string | undefined) ?? null
  } catch (e) {
    console.error('status auto-set failed', e)
  }

  return NextResponse.json({ ...visit, businessStatusId })
```

- [ ] **Step 3: Verify compile + full test suite**

Run: `npx tsc --noEmit && npm run test:run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/visits/route.ts app/api/business-visits/route.ts
git commit -m "feat: auto-set prospect status from logged visit outcomes (#2)"
```

---

### Task 5: `statusId` in read APIs and PATCH endpoints; retire `lastOutcome`

**Files:**
- Modify: `app/api/houses/route.ts`
- Modify: `app/api/houses/[id]/route.ts`
- Modify: `app/api/houses/search/route.ts`
- Modify: `app/api/businesses/route.ts`
- Modify: `app/api/businesses/search/route.ts`
- Create: `app/api/businesses/[id]/route.ts`

**Interfaces:**
- Produces: every house/business JSON row now carries `statusId: string | null` and no longer carries `lastOutcome`. `PATCH /api/houses/[id]` accepts `statusId` (uuid or null, any role). New `PATCH /api/businesses/[id]` accepts `{ statusId }` only.
- Note: after this task and until Task 6 lands, house pins render gray (UI still reads the now-absent `lastOutcome`). Expected mid-branch state, nothing crashes.

- [ ] **Step 1: Update `app/api/houses/route.ts`**

In `HOUSE_COLS`, replace the line:

```ts
  _last_visit.sale_outcome as "lastOutcome"
```

with:

```ts
  houses.status_id as "statusId"
```

Delete the whole `LAST_VISIT_LATERAL` constant, and remove `${LAST_VISIT_LATERAL}` from all five queries that interpolate it (bbox, both admin variants, both team variants). E.g. the bbox query becomes:

```ts
      sql`SELECT ${HOUSE_COLS} FROM houses
          WHERE ST_Within(houses.location, ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326))`
```

(This also fixes a latent bug: `POST` re-selects `${HOUSE_COLS}` *without* the lateral join, which referenced `_last_visit` and would have thrown.)

- [ ] **Step 2: Update `app/api/houses/[id]/route.ts`**

Add imports: `statuses` to the schema import, and keep `eq, sql` as-is.

In `PATCH`, after the `doNotKnock` block and before the `db.update`, add:

```ts
  if ('statusId' in body) {
    if (body.statusId !== null) {
      const [status] = await db.select().from(statuses).where(eq(statuses.id, body.statusId))
      if (!status || !status.active) {
        return NextResponse.json({ error: 'Unknown or inactive statusId' }, { status: 400 })
      }
    }
    updates.statusId = body.statusId
  }
```

In the trailing `SELECT`, add after the `no_soliciting_sign` line:

```ts
      houses.status_id as "statusId",
```

- [ ] **Step 3: Update `app/api/houses/search/route.ts`**

In the `HOUSE_COLS` helper, replace the `lastOutcome` subselect:

```ts
  (SELECT vi.sale_outcome FROM visits vi
   JOIN households ho2 ON vi.household_id = ho2.id
   WHERE ho2.house_id = ${sql.raw(alias)}.id
   ORDER BY vi.created_at DESC LIMIT 1) AS "lastOutcome"
```

with:

```ts
  ${sql.raw(alias)}.status_id           AS "statusId"
```

Also update the stale comment above it (`// Shared column list (no lastOutcome — computed per-branch below)` → `// Shared column list`).

- [ ] **Step 4: Update `app/api/businesses/route.ts` and `app/api/businesses/search/route.ts`**

In both files' `BUSINESS_COLS`, add after the `neighborhood_id` line:

```ts
  businesses.status_id as "statusId",
```

- [ ] **Step 5: Create `app/api/businesses/[id]/route.ts`**

```ts
export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { businesses, statuses } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { eq, sql } from 'drizzle-orm'

export const PATCH = withErrorHandling(async (req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { id } = await params
  const body = await req.json()

  if (!('statusId' in body)) {
    return NextResponse.json({ error: 'statusId required' }, { status: 400 })
  }
  if (body.statusId !== null) {
    const [status] = await db.select().from(statuses).where(eq(statuses.id, body.statusId))
    if (!status || !status.active) {
      return NextResponse.json({ error: 'Unknown or inactive statusId' }, { status: 400 })
    }
  }

  await db.update(businesses).set({ statusId: body.statusId }).where(eq(businesses.id, id))

  const result = await db.execute(sql`
    SELECT businesses.id, businesses.name, businesses.type, businesses.category,
      businesses.number, businesses.street, businesses.city, businesses.region,
      businesses.postcode, businesses.phone, businesses.website,
      businesses.external_id as "externalId",
      ST_Y(businesses.location) as lat, ST_X(businesses.location) as lng,
      businesses.neighborhood_id as "neighborhoodId",
      businesses.status_id as "statusId",
      businesses.created_at as "createdAt"
    FROM businesses WHERE businesses.id = ${id}
  `)
  if (!result.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(result.rows[0])
})
```

- [ ] **Step 6: Verify compile + tests + grep**

Run: `npx tsc --noEmit && npm run test:run`
Expected: PASS.

Run: `grep -rn "lastOutcome" app/api`
Expected: no matches (UI matches remain until Task 6).

- [ ] **Step 7: Commit**

```bash
git add app/api/houses app/api/businesses
git commit -m "feat: statusId in house/business APIs, retire lastOutcome (#2)"
```

---

### Task 6: Map pins colored by status

**Files:**
- Modify: `components/map/HousePins.tsx`
- Modify: `components/map/BusinessPins.tsx`
- Modify: `components/map/MapView.tsx`
- Modify: `components/map/MapShell.tsx`
- Modify: `components/map/HousePanel.tsx`
- Modify: `lib/houses.ts`

**Interfaces:**
- Consumes: `pinColor`, `StatusOption` from Task 2; `statusId` in API rows from Task 5.
- Produces: `HouseWithOutcome` is deleted; everything uses `HouseRow` (which now includes `statusId` via the schema). `BusinessRow` gains `statusId: string | null`. `MapView` and both pin components take `statusColors: Record<string, string>`. `MapShell` owns `statuses: StatusOption[]` state (Task 7 passes it to the panels).

- [ ] **Step 1: Remove `HouseWithOutcome` from `lib/houses.ts`**

Delete these lines (the rest of the file is unchanged):

```ts
import type { HouseRow } from '@/lib/db/schema'

export type HouseWithOutcome = HouseRow & { lastOutcome?: string | null }
```

- [ ] **Step 2: Rewrite `components/map/HousePins.tsx`**

```tsx
'use client'
import { Source, Layer } from 'react-map-gl/mapbox'
import type { HouseRow } from '@/lib/db/schema'
import { pinColor } from '@/lib/statuses'

type Props = {
  houses: HouseRow[]
  statusColors: Record<string, string>
  onHouseClick: (house: HouseRow) => void
  selectedHouseId?: string | null
}

export function HousePins({ houses, statusColors, selectedHouseId }: Props) {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: houses.map(h => ({
      type: 'Feature',
      id: h.id,
      geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
      properties: {
        id: h.id,
        color: pinColor(h, statusColors),
        flagged: h.doNotKnock || h.noSolicitingSign,
      },
    })),
  }

  return (
    <Source id="houses" type="geojson" data={geojson}>
      <Layer
        id="house-circle-highlight"
        minzoom={14}
        type="circle"
        filter={['==', ['get', 'id'], selectedHouseId ?? '']}
        paint={{
          'circle-color': 'rgba(0,0,0,0)',
          'circle-radius': 13,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#3b82f6',
          'circle-opacity': 0,
          'circle-stroke-opacity': 1,
        }}
      />
      <Layer
        id="house-circles"
        minzoom={14}
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

- [ ] **Step 3: Update `components/map/BusinessPins.tsx`**

Add `statusId: string | null` to the `BusinessRow` type (after `website`). Change props and the layer to color per feature, keeping orange as the no-status fallback so business pins stay visually distinct:

```tsx
'use client'
import { useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/mapbox'
import { pinColor } from '@/lib/statuses'

export type BusinessRow = {
  id: string
  name: string
  type: string | null
  category: string | null
  lat: number
  lng: number
  number: string | null
  street: string | null
  city: string | null
  region: string | null
  postcode: string | null
  phone: string | null
  website: string | null
  statusId: string | null
}

const BUSINESS_FALLBACK_COLOR = '#f97316'

type Props = {
  businesses: BusinessRow[]
  statusColors: Record<string, string>
}

export function BusinessPins({ businesses, statusColors }: Props) {
  const geojson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: businesses.map(b => ({
      type: 'Feature',
      id: b.id,
      geometry: { type: 'Point', coordinates: [b.lng, b.lat] },
      properties: { id: b.id, name: b.name, color: pinColor(b, statusColors, BUSINESS_FALLBACK_COLOR) },
    })),
  }), [businesses, statusColors])

  return (
    <Source id="businesses" type="geojson" data={geojson}>
      <Layer
        id="business-circles"
        minzoom={14}
        type="circle"
        paint={{
          'circle-color': ['get', 'color'],
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        }}
      />
    </Source>
  )
}
```

- [ ] **Step 4: Thread `statusColors` through `components/map/MapView.tsx`**

Add to `Props`: `statusColors: Record<string, string>`. Add `statusColors` to the destructured parameters. Pass it to both pin components:

```tsx
      {layers.homes && <HousePins houses={houses} statusColors={statusColors} onHouseClick={onHouseClick} selectedHouseId={selectedHouseId} />}
      {layers.businesses && <BusinessPins businesses={businesses} statusColors={statusColors} />}
```

- [ ] **Step 5: Update `components/map/MapShell.tsx`**

1. Change the houses import line — `HouseWithOutcome` no longer exists:
   - from: `import { type HouseWithOutcome, parseHouseNumber } from '@/lib/houses'`
   - to: `import { parseHouseNumber } from '@/lib/houses'` plus `import type { HouseRow } from '@/lib/db/schema'`
2. Delete the re-export line `export type { HouseWithOutcome }`.
3. Replace every `HouseWithOutcome` in the file with `HouseRow` (state, overrides map, `selectedHouse`, `adjacentHouses`, `handleHouseUpdate`, `fetchHousesForBounds` row type).
4. Add statuses state + fetch and the color map (imports: `import { type StatusOption } from '@/lib/statuses'`):

Add with the other `useState` calls:

```tsx
  const [statuses, setStatuses] = useState<StatusOption[]>([])
```

Add to the on-mount effect that loads neighborhoods (same effect, before the neighborhoods fetch):

```tsx
    fetch('/api/statuses')
      .then(r => r.json())
      .then(setStatuses)
      .catch(() => {})
```

Add below `effectiveHouses`:

```tsx
  const statusColors = useMemo(
    () => Object.fromEntries(statuses.map(s => [s.id, s.color])),
    [statuses]
  )
```

5. Pass `statusColors={statusColors}` to `<MapView ... />`.

- [ ] **Step 6: Update `components/map/HousePanel.tsx` types**

- Change the import `import { formatAddress, type HouseWithOutcome } from '@/lib/houses'` to `import { formatAddress } from '@/lib/houses'`.
- In `Props`, replace `prevHouse?: HouseWithOutcome | null` / `nextHouse?: HouseWithOutcome | null` / `onHouseChange?: (house: HouseWithOutcome) => void` with the same signatures using `HouseRow` (already imported).
- Change `onHouseUpdate?: (id: string, updates: Partial<HouseRow & { lastOutcome?: string | null }>) => void` to `onHouseUpdate?: (id: string, updates: Partial<HouseRow>) => void`.
- In `handleLogVisit`, delete the line:

```tsx
    if (house) onHouseUpdate?.(house.id, { lastOutcome: data.saleOutcome ?? null })
```

(Task 7 restores the live pin update using `houseStatusId` from the POST response.)

- [ ] **Step 7: Verify — compile, tests, no stragglers**

Run: `npx tsc --noEmit && npm run test:run`
Expected: PASS.

Run: `grep -rn "lastOutcome\|HouseWithOutcome" app components lib --include="*.ts" --include="*.tsx"`
Expected: no matches. If anything shows up (e.g. `app/(app)/map/page.tsx`), replace `HouseWithOutcome` with `HouseRow` there too.

- [ ] **Step 8: Commit**

```bash
git add lib/houses.ts components/map app
git commit -m "feat: color map pins from prospect status (#2)"
```

---

### Task 7: One-tap status chips in the house and business panels

**Files:**
- Create: `components/map/StatusChips.tsx`
- Create: `components/map/StatusChips.test.tsx`
- Modify: `components/map/HousePanel.tsx`
- Modify: `components/map/BusinessPanel.tsx`
- Modify: `components/map/MapShell.tsx`

**Interfaces:**
- Consumes: `StatusOption` from Task 2; `statuses` state in `MapShell` from Task 6; `PATCH /api/houses/[id]` + `PATCH /api/businesses/[id]` from Task 5; `houseStatusId`/`businessStatusId` in visit POST responses from Task 4.
- Produces: `StatusChips` component with props `{ statuses: StatusOption[]; value: string | null; onSelect: (statusId: string | null) => void; disabled?: boolean }`. `HousePanel` gains prop `statuses: StatusOption[]`; `BusinessPanel` gains `statuses: StatusOption[]` and `onBusinessUpdate?: (id: string, updates: Partial<BusinessRow>) => void`.

- [ ] **Step 1: Write the failing component test**

Create `components/map/StatusChips.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { StatusChips } from './StatusChips'
import type { StatusOption } from '@/lib/statuses'

const STATUSES: StatusOption[] = [
  { id: 's1', name: 'Interested', color: '#eab308', sortOrder: 1, active: true, autoKey: 'interested' },
  { id: 's2', name: 'Customer', color: '#22c55e', sortOrder: 2, active: true, autoKey: 'customer' },
  { id: 's3', name: 'Old Status', color: '#8b5cf6', sortOrder: 3, active: false, autoKey: null },
]

describe('StatusChips', () => {
  it('renders active statuses as buttons, hides inactive ones', () => {
    render(<StatusChips statuses={STATUSES} value={null} onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Interested' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Customer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Old Status' })).not.toBeInTheDocument()
  })

  it('shows an inactive status if it is the current value', () => {
    render(<StatusChips statuses={STATUSES} value="s3" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Old Status' })).toBeInTheDocument()
  })

  it('marks the selected chip with aria-pressed', () => {
    render(<StatusChips statuses={STATUSES} value="s2" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Customer' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Interested' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('selecting an unselected chip calls onSelect with its id', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<StatusChips statuses={STATUSES} value={null} onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: 'Customer' }))
    expect(onSelect).toHaveBeenCalledWith('s2')
  })

  it('tapping the selected chip calls onSelect with null (clear)', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<StatusChips statuses={STATUSES} value="s2" onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: 'Customer' }))
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- components/map/StatusChips.test.tsx`
Expected: FAIL — cannot resolve `./StatusChips`.

- [ ] **Step 3: Implement `components/map/StatusChips.tsx`**

```tsx
'use client'
import { cn } from '@/lib/utils'
import type { StatusOption } from '@/lib/statuses'

type Props = {
  statuses: StatusOption[]
  value: string | null
  onSelect: (statusId: string | null) => void
  disabled?: boolean
}

export function StatusChips({ statuses, value, onSelect, disabled }: Props) {
  const visible = statuses.filter(s => s.active || s.id === value)
  if (visible.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map(s => {
        const selected = s.id === value
        return (
          <button
            key={s.id}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onSelect(selected ? null : s.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-50',
              !selected && 'bg-background hover:bg-muted'
            )}
            style={selected
              ? { backgroundColor: s.color, borderColor: s.color, color: '#ffffff' }
              : { borderColor: s.color, color: s.color }}
          >
            {s.name}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- components/map/StatusChips.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Integrate into `components/map/HousePanel.tsx`**

1. Add imports:

```tsx
import { StatusChips } from './StatusChips'
import type { StatusOption } from '@/lib/statuses'
```

2. Add `statuses: StatusOption[]` to `Props` (after `userRole`).
3. Add a handler inside the component (near `handleFlagToggle`) — optimistic update, revert on failure:

```tsx
  async function handleStatusSelect(statusId: string | null) {
    if (!house) return
    const previous = house.statusId
    onHouseUpdate?.(house.id, { statusId })
    const res = await fetch(`/api/houses/${house.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusId }),
    })
    if (!res.ok) {
      onHouseUpdate?.(house.id, { statusId: previous })
      setError('Failed to update status. Please try again.')
    }
  }
```

4. Render the chips in the `'detail'` view, between the household card and the Actions block:

```tsx
              {/* Status */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                <StatusChips statuses={statuses} value={house?.statusId ?? null} onSelect={handleStatusSelect} />
              </div>
```

5. In `handleLogVisit`, use the auto-set result to keep the pin in sync (replaces the line deleted in Task 6). Change:

```tsx
    if (!res.ok) { setError('Failed to save visit. Please try again.'); return }
```

to:

```tsx
    if (!res.ok) { setError('Failed to save visit. Please try again.'); return }
    const saved = await res.json()
    if (house && saved.houseStatusId !== undefined) {
      onHouseUpdate?.(house.id, { statusId: saved.houseStatusId })
    }
```

- [ ] **Step 6: Integrate into `components/map/BusinessPanel.tsx`**

1. Add imports:

```tsx
import { StatusChips } from './StatusChips'
import type { StatusOption } from '@/lib/statuses'
```

2. Extend `Props`:

```tsx
type Props = {
  business: BusinessRow | null
  statuses: StatusOption[]
  onClose: () => void
  onBusinessUpdate?: (id: string, updates: Partial<BusinessRow>) => void
}
```

and destructure the new props in the component signature.

3. Add a status error state next to the other state hooks: `const [statusError, setStatusError] = useState<string | null>(null)`, and add the handler:

```tsx
  async function handleStatusSelect(statusId: string | null) {
    if (!business) return
    const previous = business.statusId
    setStatusError(null)
    onBusinessUpdate?.(business.id, { statusId })
    const res = await fetch(`/api/businesses/${business.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusId }),
    })
    if (!res.ok) {
      onBusinessUpdate?.(business.id, { statusId: previous })
      setStatusError('Failed to update status. Please try again.')
    }
  }
```

4. In the `'detail'` view, insert between the info block and the Log Visit button:

```tsx
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                {statusError && <p className="mb-2 text-sm text-destructive">{statusError}</p>}
                <StatusChips statuses={statuses} value={business?.statusId ?? null} onSelect={handleStatusSelect} />
              </div>
```

5. In `handleSaveVisit`, after `const visit = await res.json()` inside the `if (res.ok)` block, add:

```tsx
      if (business && visit.businessStatusId !== undefined) {
        onBusinessUpdate?.(business.id, { statusId: visit.businessStatusId })
      }
```

- [ ] **Step 7: Wire up `components/map/MapShell.tsx`**

1. Add a business update handler (near `handleHouseUpdate`):

```tsx
  function handleBusinessUpdate(id: string, updates: Partial<BusinessRow>) {
    setBusinesses(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b))
    setSelectedBusiness(prev => prev?.id === id ? { ...prev, ...updates } : prev)
  }
```

2. Pass the new props:

```tsx
      <BusinessPanel
        business={selectedBusiness}
        statuses={statuses}
        onBusinessUpdate={handleBusinessUpdate}
        onClose={() => setSelectedBusiness(null)}
      />
      <HousePanel
        house={selectedHouse}
        statuses={statuses}
        userRole={userRole}
        ...
```

(keep the remaining existing props unchanged).

- [ ] **Step 8: Verify — full suite + compile**

Run: `npx tsc --noEmit && npm run test:run`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add components/map
git commit -m "feat: one-tap status chips in house and business panels (#2)"
```

---

### Task 8: Admin statuses page and nav entry

**Files:**
- Create: `app/(app)/admin/statuses/page.tsx`
- Create: `app/(app)/admin/statuses/client.tsx`
- Modify: `app/(app)/nav-bar.tsx`

**Interfaces:**
- Consumes: statuses API from Task 3; `StatusOption`, `isValidHexColor` from Task 2 (client uses the preset palette, so no free hex input).

- [ ] **Step 1: Create `app/(app)/admin/statuses/page.tsx`**

```tsx
export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { statuses } from '@/lib/db/schema'
import { StatusesClient } from './client'

export default async function StatusesPage() {
  const session = await auth()
  if (session?.user?.role !== 'admin') redirect('/map')

  const rows = await db.select().from(statuses).orderBy(statuses.sortOrder, statuses.createdAt)

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-1">Statuses</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Statuses reps can set on houses and businesses. System statuses are set
        automatically from visit outcomes and cannot be deleted.
      </p>
      <StatusesClient initialStatuses={rows} />
    </div>
  )
}
```

- [ ] **Step 2: Create `app/(app)/admin/statuses/client.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Status } from '@/lib/db/schema'
import { ChevronUpIcon, ChevronDownIcon, Trash2Icon } from 'lucide-react'

const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#94a3b8', '#78716c',
]

const AUTO_LABEL: Record<string, string> = {
  not_home: 'Not Home',
  interested: 'Interested',
  callback: 'Follow Up',
  customer: 'Sold',
  not_interested: 'Refused / Not Interested',
}

type Props = { initialStatuses: Status[] }

export function StatusesClient({ initialStatuses }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initialStatuses)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PALETTE[5])
  const [busy, setBusy] = useState(false)

  async function refresh() {
    const res = await fetch('/api/statuses')
    if (res.ok) setItems(await res.json())
    router.refresh()
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null)
    setBusy(true)
    const res = await fetch(`/api/statuses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? 'Update failed')
      return false
    }
    await refresh()
    return true
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setError(null)
    setBusy(true)
    const res = await fetch('/api/statuses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    })
    setBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? 'Create failed')
      return
    }
    setNewName('')
    await refresh()
  }

  async function handleDelete(s: Status) {
    if (!window.confirm(`Delete "${s.name}"? Houses with this status will lose it.`)) return
    setError(null)
    setBusy(true)
    const res = await fetch(`/api/statuses/${s.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? 'Delete failed')
      return
    }
    await refresh()
  }

  async function move(index: number, dir: -1 | 1) {
    const a = items[index]
    const b = items[index + dir]
    if (!a || !b) return
    // Swap sort orders via two PATCHes; refresh re-sorts
    const ok = await patch(a.id, { sortOrder: b.sortOrder })
    if (ok) await patch(b.id, { sortOrder: a.sortOrder })
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      <ul className="space-y-2">
        {items.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 border rounded-xl p-3">
            <span className="h-5 w-5 shrink-0 rounded-full border" style={{ backgroundColor: s.color }} />
            <div className="flex-1 min-w-0">
              <EditableName status={s} onSave={name => patch(s.id, { name })} />
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {PALETTE.map(c => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Set color ${c}`}
                    onClick={() => patch(s.id, { color: c })}
                    className={cn('h-4 w-4 rounded-full border', s.color === c && 'ring-2 ring-offset-1 ring-primary')}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            {s.autoKey && <Badge variant="secondary">auto: {AUTO_LABEL[s.autoKey] ?? s.autoKey}</Badge>}
            {!s.autoKey && (
              <Badge
                variant={s.active ? 'default' : 'secondary'}
                className="cursor-pointer"
                onClick={() => patch(s.id, { active: !s.active })}
              >
                {s.active ? 'Active' : 'Inactive'}
              </Badge>
            )}
            <div className="flex flex-col">
              <button disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Move up"
                className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                <ChevronUpIcon className="h-4 w-4" />
              </button>
              <button disabled={busy || i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down"
                className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                <ChevronDownIcon className="h-4 w-4" />
              </button>
            </div>
            {!s.autoKey && (
              <button disabled={busy} onClick={() => handleDelete(s)} aria-label={`Delete ${s.name}`}
                className="text-muted-foreground hover:text-destructive disabled:opacity-30">
                <Trash2Icon className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={handleAdd} className="flex items-center gap-2 border rounded-xl p-3">
        <Input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New status name…"
          className="flex-1"
        />
        <div className="flex items-center gap-1">
          {PALETTE.map(c => (
            <button
              key={c}
              type="button"
              aria-label={`Choose color ${c}`}
              onClick={() => setNewColor(c)}
              className={cn('h-5 w-5 rounded-full border', newColor === c && 'ring-2 ring-offset-1 ring-primary')}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <Button type="submit" disabled={busy || !newName.trim()}>Add</Button>
      </form>
    </div>
  )
}

function EditableName({ status, onSave }: { status: Status; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(status.name)

  if (!editing) {
    return (
      <button type="button" className="font-medium hover:underline" onClick={() => { setName(status.name); setEditing(true) }}>
        {status.name}
      </button>
    )
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={e => { e.preventDefault(); if (name.trim()) { onSave(name.trim()); setEditing(false) } }}
    >
      <Input value={name} onChange={e => setName(e.target.value)} className="h-8" autoFocus />
      <Button type="submit" size="sm">Save</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
    </form>
  )
}
```

- [ ] **Step 3: Add the nav entry**

In `app/(app)/nav-bar.tsx`, add to `ADMIN_ITEMS` (after the Parcels row):

```ts
  { href: '/admin/statuses',       label: 'Statuses',      roles: ['admin'] },
```

- [ ] **Step 4: Verify compile + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm run test:run`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/admin/statuses" "app/(app)/nav-bar.tsx"
git commit -m "feat: admin statuses page with palette, reorder, and system-row guard (#2)"
```

---

### Task 9: End-to-end verification

**Files:** none created — verification and fixes only.

- [ ] **Step 1: Full gates**

Run: `npm run lint && npm run test:run && npm run build`
Expected: all pass. `next build` catches route typing and edge-runtime issues the dev server hides.

- [ ] **Step 2: Manual smoke test (dev server)**

Requires `.env.local` (see Global Constraints). Run `npm run dev` (set `PORT` if another worktree is using 3000) and verify in the browser:

1. Map loads; zoom past 14 — houses previously visited show their backfilled status colors, unvisited are gray, flagged are black.
2. Open a house → chip row shows the five seeded statuses; tap "Customer" → chip fills green, pin turns green; tap it again → clears, pin returns gray.
3. Log a visit with outcome "Sold" → panel returns to detail, pin turns green (Customer) without a page reload.
4. Open a business → same chip behavior; business with no status keeps the orange pin.
5. Visit `/admin/statuses` as admin: rename a system status (works), try its delete (no delete button), add a custom status, see it appear in the house panel chips, delete it — the house that had it goes gray.
6. As a non-admin (or via curl without auth), confirm `POST /api/statuses` is rejected.

- [ ] **Step 3: Fix anything found, re-run gates, commit fixes**

```bash
git add -A
git commit -m "fix: post-verification fixes for prospect statuses (#2)"
```

(Skip the commit if nothing needed fixing.)

---

## Self-Review Notes

- **Spec coverage:** table+seed+backfill (Task 1), mapping (Task 2), statuses CRUD + system-row protection (Task 3), auto-set never failing visit insert (Task 4), statusId in reads / PATCH endpoints / lastOutcome retired (Task 5), pin coloring + gray/black rules (Task 6), chips + optimistic updates + post-visit sync (Task 7), admin page with palette + badges (Task 8), migration/backfill verification (Tasks 1 & 9). Out-of-scope items from the spec (map filtering, per-team lists, audit trail) are intentionally absent.
- **Types:** `StatusOption` (client) vs `Status` (server/Drizzle) used consistently; `HouseWithOutcome` fully removed in Task 6 with a grep gate.
- **Known mid-branch state:** between Tasks 5 and 6, pins render gray. Do not stop the branch between those tasks.
