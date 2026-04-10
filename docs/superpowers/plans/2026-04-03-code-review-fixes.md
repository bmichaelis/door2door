# Code Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all Critical, Important, and Minor issues identified in the code review of the Door-to-Door Sales Platform.

**Architecture:** Fixes are grouped by theme: (1) error handling infrastructure, (2) SQL injection, (3) stats extraction, (4) auth adapter schema, (5) data scoping & validation, (6) UI error handling, (7) map interactivity, (8) minor polish.

**Tech Stack:** Next.js 15 App Router, TypeScript, Drizzle ORM, react-map-gl, @mapbox/mapbox-gl-draw, shadcn/ui

---

## File Map

**New files:**
- `lib/api.ts` — `withErrorHandling` wrapper for all route handlers
- `lib/stats.ts` — extracted stat queries (3 functions by role)
- `components/forms/HouseForm.tsx` — form to add a house from map tap

**Modified files:**
- `lib/permissions.ts` — add `ForbiddenError`, remove `assertRole` alias
- `lib/db/schema.ts` — fix `accounts` column JS property names to camelCase
- `app/layout.tsx` — fix boilerplate metadata
- `app/(app)/dashboard/page.tsx` — call `lib/stats.ts` directly (no loopback fetch)
- `app/api/stats/route.ts` — delegate to `lib/stats.ts`
- `app/api/neighborhoods/[id]/route.ts` — fix SQL injection in PATCH
- `app/api/houses/route.ts` — scope GET to rep's team, add POST validation
- `app/api/houses/import/route.ts` — add concurrency cap on geocoding
- `app/api/visits/route.ts` — add POST validation
- `app/api/households/route.ts` — add POST validation
- `app/api/users/[id]/route.ts` — add PATCH validation
- `app/api/teams/route.ts` — wrap with `withErrorHandling`
- `app/api/teams/[id]/route.ts` — wrap with `withErrorHandling`
- `app/api/users/route.ts` — wrap with `withErrorHandling`
- `app/api/products/route.ts` — wrap with `withErrorHandling`
- `app/api/products/[id]/route.ts` — wrap with `withErrorHandling`
- `app/api/neighborhoods/route.ts` — wrap with `withErrorHandling`
- `app/api/houses/[id]/route.ts` — wrap with `withErrorHandling`
- `components/map/HousePanel.tsx` — add error state, check res.ok, fix useEffect dep
- `components/map/MapView.tsx` — add `interactiveLayerIds`, handle house-pin clicks
- `components/map/MapShell.tsx` — add tap-to-add-house flow with HouseForm
- `components/map/DrawControl.tsx` — add `draw.update` handler
- `components/forms/VisitForm.tsx` — add `serviceDate` field

---

## Task 1: Error Handling Infrastructure

**Files:**
- Create: `lib/api.ts`
- Modify: `lib/permissions.ts`

- [ ] **Step 1: Update `lib/permissions.ts`**

Add `ForbiddenError`, remove the `assertRole` alias (it duplicated `requireRole`). All routes already import `assertRole` — they will be updated in Task 2 onwards to use `requireRole` via `withErrorHandling`.

```typescript
type Role = 'admin' | 'manager' | 'rep'

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export function requireRole(userRole: Role | null | undefined, ...allowed: Role[]): void {
  if (!userRole || !allowed.includes(userRole)) {
    throw new ForbiddenError(`Forbidden: requires ${allowed.join(' or ')}`)
  }
}

export function canManageTeam(user: { role: Role | null; teamId: string | null }, teamId: string): boolean {
  if (user.role === 'admin') return true
  if (user.role === 'manager') return user.teamId === teamId
  return false
}

export function canSetDoNotKnock(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'manager'
}

export function isAdmin(role: Role | null | undefined): boolean {
  return role === 'admin'
}
```

- [ ] **Step 2: Create `lib/api.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { ForbiddenError } from '@/lib/permissions'

type Ctx = { params: Promise<Record<string, string>> }
type Handler = (req: NextRequest, ctx: Ctx) => Promise<NextResponse>

export function withErrorHandling(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx)
    } catch (e) {
      if (e instanceof ForbiddenError) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      console.error(e)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/permissions.ts lib/api.ts
git commit -m "fix: add ForbiddenError and withErrorHandling wrapper"
```

---

## Task 2: Apply Error Handling to All Route Files

**Files:**
- Modify: `app/api/teams/route.ts`, `app/api/teams/[id]/route.ts`, `app/api/users/route.ts`, `app/api/products/route.ts`, `app/api/products/[id]/route.ts`, `app/api/neighborhoods/route.ts`, `app/api/houses/[id]/route.ts`

Switch from `export async function X` to `export const X = withErrorHandling(async ...)`. Replace `assertRole` with `requireRole`.

- [ ] **Step 1: Update `app/api/teams/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { teams } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'

export const GET = withErrorHandling(async () => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const rows = await db.select().from(teams).orderBy(teams.name)
  return NextResponse.json(rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const [team] = await db.insert(teams).values({
    name: body.name,
    managerId: body.managerId ?? null,
  }).returning()
  return NextResponse.json(team, { status: 201 })
})
```

- [ ] **Step 2: Update `app/api/teams/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { teams } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { eq } from 'drizzle-orm'

export const PATCH = withErrorHandling(async (req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const { id } = await params
  const body = await req.json()
  const [team] = await db.update(teams)
    .set({ name: body.name, managerId: body.managerId })
    .where(eq(teams.id, id))
    .returning()
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(team)
})

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const { id } = await params
  await db.delete(teams).where(eq(teams.id, id))
  return new NextResponse(null, { status: 204 })
})
```

- [ ] **Step 3: Update `app/api/users/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'

export const GET = withErrorHandling(async () => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager')
  const rows = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    image: users.image,
    role: users.role,
    teamId: users.teamId,
    createdAt: users.createdAt,
  }).from(users).orderBy(users.name)
  return NextResponse.json(rows)
})
```

- [ ] **Step 4: Update `app/api/products/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { products } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'

export const GET = withErrorHandling(async () => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const rows = await db.select().from(products).orderBy(products.name)
  return NextResponse.json(rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const [product] = await db.insert(products).values({
    name: body.name,
    description: body.description ?? null,
  }).returning()
  return NextResponse.json(product, { status: 201 })
})
```

- [ ] **Step 5: Update `app/api/products/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { products } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { eq } from 'drizzle-orm'

export const PATCH = withErrorHandling(async (req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const { id } = await params
  const body = await req.json()
  const [product] = await db.update(products)
    .set({ name: body.name, description: body.description, active: body.active })
    .where(eq(products.id, id))
    .returning()
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(product)
})

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const { id } = await params
  await db.delete(products).where(eq(products.id, id))
  return new NextResponse(null, { status: 204 })
})
```

- [ ] **Step 6: Update `app/api/neighborhoods/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql } from 'drizzle-orm'

export const GET = withErrorHandling(async () => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const rows = await db.execute(
    sql`SELECT id, name, team_id, created_at,
        ST_AsGeoJSON(boundary)::json as boundary
        FROM neighborhoods ORDER BY name`
  )
  return NextResponse.json(rows.rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const geojson = JSON.stringify(
    body.boundary?.type === 'Feature' ? body.boundary.geometry : body.boundary
  )
  const rows = await db.execute(
    sql`INSERT INTO neighborhoods (name, team_id, boundary)
        VALUES (${body.name}, ${body.teamId ?? null}, ST_GeomFromGeoJSON(${geojson}))
        RETURNING id, name, team_id, created_at,
        ST_AsGeoJSON(boundary)::json as boundary`
  )
  return NextResponse.json(rows.rows[0], { status: 201 })
})
```

- [ ] **Step 7: Update `app/api/houses/[id]/route.ts`**

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
  if (body.address !== undefined) updates.address = body.address
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

- [ ] **Step 8: Commit**

```bash
git add app/api/teams/ app/api/users/route.ts app/api/products/ app/api/neighborhoods/route.ts app/api/houses/[id]/
git commit -m "fix: wrap all route handlers with error handling, return 403 on auth failure"
```

---

## Task 3: Fix SQL Injection in Neighborhoods PATCH

**Files:**
- Modify: `app/api/neighborhoods/[id]/route.ts`

Replace the `sql.raw(updates.join(', '))` string interpolation with Drizzle's typed `update().set()` for scalar fields and a parameterized sql template for the geometry update.

- [ ] **Step 1: Rewrite `app/api/neighborhoods/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { neighborhoods } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql, eq } from 'drizzle-orm'

export const PATCH = withErrorHandling(async (req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const { id } = await params
  const body = await req.json()

  // Update scalar fields via typed Drizzle update (parameterized, no injection risk)
  const scalarUpdates: Partial<typeof neighborhoods.$inferInsert> = {}
  if (body.name !== undefined) scalarUpdates.name = body.name
  if (body.teamId !== undefined) scalarUpdates.teamId = body.teamId ?? null

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
        ST_AsGeoJSON(boundary)::json as boundary
        FROM neighborhoods WHERE id = ${id}`
  )
  if (!rows.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(rows.rows[0])
})

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const { id } = await params
  await db.delete(neighborhoods).where(eq(neighborhoods.id, id))
  return new NextResponse(null, { status: 204 })
})
```

- [ ] **Step 2: Commit**

```bash
git add app/api/neighborhoods/[id]/route.ts
git commit -m "fix: eliminate SQL injection in neighborhoods PATCH by using parameterized queries"
```

---

## Task 4: Extract Stats Logic and Fix Dashboard

**Files:**
- Create: `lib/stats.ts`
- Modify: `app/api/stats/route.ts`, `app/(app)/dashboard/page.tsx`

The dashboard currently does `fetch('/api/stats')` which is a loopback HTTP call that fails on Cloudflare Pages (no local HTTP server). Extract the queries into `lib/stats.ts` and call them directly from both the dashboard Server Component and the API route.

- [ ] **Step 1: Create `lib/stats.ts`**

```typescript
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

export type RepStats = {
  visits_today: string
  visits_this_week: string
  sales_this_week: string
  follow_ups_due: string
}

export type ManagerStats = {
  reps: { id: string; name: string; visits_this_week: string; sales_this_week: string }[]
  coverage: { name: string; total_houses: string; visited_houses: string }[]
}

export type AdminStats = {
  team_name: string
  visits_this_month: string
  sales_this_month: string
  top_product: string | null
}[]

export async function getRepStats(userId: string): Promise<RepStats> {
  const rows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE v.created_at >= CURRENT_DATE) as visits_today,
      COUNT(*) FILTER (WHERE v.created_at >= date_trunc('week', CURRENT_DATE)) as visits_this_week,
      COUNT(*) FILTER (WHERE v.sale_outcome = 'sold' AND v.created_at >= date_trunc('week', CURRENT_DATE)) as sales_this_week,
      COUNT(*) FILTER (WHERE v.follow_up_at IS NOT NULL AND v.follow_up_at >= NOW() AND v.follow_up_at < NOW() + INTERVAL '7 days') as follow_ups_due
    FROM visits v WHERE v.user_id = ${userId}
  `)
  return rows.rows[0] as RepStats
}

export async function getManagerStats(teamId: string): Promise<ManagerStats> {
  const reps = await db.execute(sql`
    SELECT
      u.id, u.name,
      COUNT(v.id) FILTER (WHERE v.created_at >= date_trunc('week', CURRENT_DATE)) as visits_this_week,
      COUNT(v.id) FILTER (WHERE v.sale_outcome = 'sold' AND v.created_at >= date_trunc('week', CURRENT_DATE)) as sales_this_week
    FROM users u
    LEFT JOIN visits v ON v.user_id = u.id
    WHERE u.team_id = ${teamId}
    GROUP BY u.id, u.name
    ORDER BY u.name
  `)
  const coverage = await db.execute(sql`
    SELECT
      n.name,
      COUNT(DISTINCT h.id) as total_houses,
      COUNT(DISTINCT ho.house_id) FILTER (WHERE ho.id IS NOT NULL) as visited_houses
    FROM neighborhoods n
    LEFT JOIN houses h ON h.neighborhood_id = n.id
    LEFT JOIN households ho ON ho.house_id = h.id
    LEFT JOIN visits v ON v.household_id = ho.id
    WHERE n.team_id = ${teamId}
    GROUP BY n.id, n.name
  `)
  return { reps: reps.rows as any, coverage: coverage.rows as any }
}

export async function getAdminStats(): Promise<AdminStats> {
  const rows = await db.execute(sql`
    SELECT
      t.name as team_name,
      COUNT(v.id) FILTER (WHERE v.created_at >= date_trunc('month', CURRENT_DATE)) as visits_this_month,
      COUNT(v.id) FILTER (WHERE v.sale_outcome = 'sold' AND v.created_at >= date_trunc('month', CURRENT_DATE)) as sales_this_month,
      p.name as top_product
    FROM teams t
    LEFT JOIN users u ON u.team_id = t.id
    LEFT JOIN visits v ON v.user_id = u.id
    LEFT JOIN products p ON v.product_id = p.id
    GROUP BY t.id, t.name, p.name
    ORDER BY t.name
  `)
  return rows.rows as AdminStats
}
```

- [ ] **Step 2: Rewrite `app/api/stats/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { getRepStats, getManagerStats, getAdminStats } from '@/lib/stats'

export const GET = withErrorHandling(async () => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { role, id: userId, teamId } = session!.user!

  if (role === 'rep') return NextResponse.json(await getRepStats(userId))
  if (role === 'manager') return NextResponse.json(await getManagerStats(teamId!))
  return NextResponse.json(await getAdminStats())
})
```

- [ ] **Step 3: Rewrite `app/(app)/dashboard/page.tsx`**

```typescript
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getRepStats, getManagerStats, getAdminStats } from '@/lib/stats'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.role) redirect('/waiting')

  const { role, id: userId, teamId } = session.user

  if (role === 'rep') {
    const stats = await getRepStats(userId)
    const { RepStats } = await import('@/components/dashboard/RepStats')
    return <RepStats stats={stats} />
  }
  if (role === 'manager') {
    const stats = await getManagerStats(teamId!)
    const { ManagerStats } = await import('@/components/dashboard/ManagerStats')
    return <ManagerStats stats={stats} />
  }
  const stats = await getAdminStats()
  const { AdminStats } = await import('@/components/dashboard/AdminStats')
  return <AdminStats stats={stats} />
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/stats.ts app/api/stats/route.ts app/\(app\)/dashboard/page.tsx
git commit -m "fix: extract stats to lib/stats.ts, remove Cloudflare-incompatible loopback fetch"
```

---

## Task 5: Fix Accounts Table Column Names

**Files:**
- Modify: `lib/db/schema.ts`

The `accounts` table has snake_case JS property names (`refresh_token`, `access_token`, etc.) but `@auth/drizzle-adapter` reads the object keys by camelCase convention. The DB column names (second argument) stay the same — only the JS property names change.

- [ ] **Step 1: Update accounts table in `lib/db/schema.ts`**

Replace only the accounts table definition (lines 34–48). Everything else in the file stays unchanged.

```typescript
export const accounts = pgTable('accounts', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refreshToken: text('refresh_token'),
  accessToken: text('access_token'),
  expiresAt: integer('expires_at'),
  tokenType: text('token_type'),
  scope: text('scope'),
  idToken: text('id_token'),
  sessionState: text('session_state'),
}, (table) => ({
  pk: primaryKey({ columns: [table.provider, table.providerAccountId] }),
}))
```

- [ ] **Step 2: Commit**

```bash
git add lib/db/schema.ts
git commit -m "fix: rename accounts columns to camelCase to match @auth/drizzle-adapter expectations"
```

---

## Task 6: Scope Houses Endpoint + Add Input Validation

**Files:**
- Modify: `app/api/houses/route.ts`, `app/api/visits/route.ts`, `app/api/households/route.ts`, `app/api/users/[id]/route.ts`

`GET /api/houses` currently returns all houses regardless of role. Reps and managers should only see houses in their team's neighborhoods. Also add required-field validation to POSTs that currently produce raw Postgres errors on missing fields.

- [ ] **Step 1: Rewrite `app/api/houses/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { houses } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql } from 'drizzle-orm'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { role, teamId } = session!.user!
  const { searchParams } = new URL(req.url)
  const neighborhoodId = searchParams.get('neighborhoodId')

  // Admins see all; reps and managers are scoped to their team's neighborhoods
  if (role === 'admin') {
    const query = neighborhoodId
      ? sql`SELECT * FROM houses WHERE neighborhood_id = ${neighborhoodId}`
      : sql`SELECT * FROM houses`
    const rows = await db.execute(query)
    return NextResponse.json(rows.rows)
  }

  if (!teamId) return NextResponse.json([])

  const query = neighborhoodId
    ? sql`SELECT h.* FROM houses h
          JOIN neighborhoods n ON h.neighborhood_id = n.id
          WHERE n.team_id = ${teamId} AND h.neighborhood_id = ${neighborhoodId}`
    : sql`SELECT h.* FROM houses h
          JOIN neighborhoods n ON h.neighborhood_id = n.id
          WHERE n.team_id = ${teamId}`
  const rows = await db.execute(query)
  return NextResponse.json(rows.rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const body = await req.json()

  if (!body.address) return NextResponse.json({ error: 'address required' }, { status: 400 })
  if (body.lat == null) return NextResponse.json({ error: 'lat required' }, { status: 400 })
  if (body.lng == null) return NextResponse.json({ error: 'lng required' }, { status: 400 })

  const { address, lat, lng } = body

  const neighborhoodResult = await db.execute(
    sql`SELECT id FROM neighborhoods
        WHERE ST_Within(ST_SetSRID(ST_Point(${lng}, ${lat}), 4326), boundary)
        LIMIT 1`
  )
  const neighborhoodId = neighborhoodResult.rows[0]?.id ?? null

  const [house] = await db.insert(houses).values({
    address,
    lat,
    lng,
    neighborhoodId: neighborhoodId as string | null,
  }).returning()

  return NextResponse.json(house, { status: 201 })
})
```

- [ ] **Step 2: Rewrite `app/api/visits/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { visits } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { eq, desc } from 'drizzle-orm'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const householdId = new URL(req.url).searchParams.get('householdId')
  if (!householdId) return NextResponse.json({ error: 'householdId required' }, { status: 400 })
  const rows = await db.select().from(visits)
    .where(eq(visits.householdId, householdId))
    .orderBy(desc(visits.createdAt))
  return NextResponse.json(rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const body = await req.json()

  if (!body.householdId) return NextResponse.json({ error: 'householdId required' }, { status: 400 })
  if (!body.contactStatus) return NextResponse.json({ error: 'contactStatus required' }, { status: 400 })

  const validContactStatuses = ['answered', 'not_home', 'refused']
  if (!validContactStatuses.includes(body.contactStatus)) {
    return NextResponse.json({ error: 'contactStatus must be answered, not_home, or refused' }, { status: 400 })
  }

  const [visit] = await db.insert(visits).values({
    householdId: body.householdId,
    userId: session!.user!.id,
    contactStatus: body.contactStatus,
    interestLevel: body.interestLevel ?? null,
    notes: body.notes ?? null,
    followUpAt: body.followUpAt ? new Date(body.followUpAt) : null,
    saleOutcome: body.saleOutcome ?? null,
    productId: body.productId ?? null,
    installDate: body.installDate ? new Date(body.installDate) : null,
    serviceDate: body.serviceDate ? new Date(body.serviceDate) : null,
  }).returning()
  return NextResponse.json(visit, { status: 201 })
})
```

- [ ] **Step 3: Rewrite `app/api/households/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { households } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { eq, sql } from 'drizzle-orm'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const houseId = new URL(req.url).searchParams.get('houseId')
  if (!houseId) return NextResponse.json({ error: 'houseId required' }, { status: 400 })
  const rows = await db.select().from(households)
    .where(eq(households.houseId, houseId))
    .orderBy(sql`${households.active} DESC, ${households.createdAt} DESC`)
  return NextResponse.json(rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const body = await req.json()

  if (!body.houseId) return NextResponse.json({ error: 'houseId required' }, { status: 400 })

  await db.update(households)
    .set({ active: false })
    .where(eq(households.houseId, body.houseId))

  const [household] = await db.insert(households).values({
    houseId: body.houseId,
    surname: body.surname ?? null,
    headOfHouseholdName: body.headOfHouseholdName ?? null,
    active: true,
  }).returning()
  return NextResponse.json(household, { status: 201 })
})
```

- [ ] **Step 4: Rewrite `app/api/users/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { eq } from 'drizzle-orm'

const VALID_ROLES = ['admin', 'manager', 'rep'] as const

export const PATCH = withErrorHandling(async (req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const { id } = await params
  const body = await req.json()

  if (body.role !== undefined && !VALID_ROLES.includes(body.role)) {
    return NextResponse.json({ error: 'role must be admin, manager, or rep' }, { status: 400 })
  }

  const [user] = await db.update(users)
    .set({ role: body.role, teamId: body.teamId })
    .where(eq(users.id, id))
    .returning()
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(user)
})
```

- [ ] **Step 5: Commit**

```bash
git add app/api/houses/route.ts app/api/visits/route.ts app/api/households/route.ts app/api/users/[id]/route.ts
git commit -m "fix: scope houses by team for reps/managers, add input validation to POST routes"
```

---

## Task 7: Fix HousePanel Error Handling and useEffect

**Files:**
- Modify: `components/map/HousePanel.tsx`

Currently all `fetch()` calls discard the response status. A failed visit POST silently returns to the detail view — the rep thinks the visit was logged but it was not. Add an `error` state, check `res.ok` in all fetch calls, and display the error. Also fix the `useEffect` missing dependency.

- [ ] **Step 1: Rewrite `components/map/HousePanel.tsx`**

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { VisitForm, type VisitFormData } from '@/components/forms/VisitForm'
import { HouseholdForm } from '@/components/forms/HouseholdForm'
import type { House } from '@/lib/db/schema'

type Household = { id: string; surname: string | null; headOfHouseholdName: string | null; active: boolean; createdAt: string }
type Visit = { id: string; contactStatus: string; interestLevel: string | null; saleOutcome: string | null; notes: string | null; createdAt: string }
type Product = { id: string; name: string }

type Props = {
  house: House | null
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
    <Sheet open={!!house} onOpenChange={open => !open && onClose()}>
      <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">
            {house.address}
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

- [ ] **Step 2: Commit**

```bash
git add components/map/HousePanel.tsx
git commit -m "fix: add error handling to HousePanel, surface fetch failures to user"
```

---

## Task 8: Wire House Pin Clicks on the Map

**Files:**
- Modify: `components/map/MapView.tsx`

`HousePins` renders pins but clicking them does nothing because there's no click listener on the Mapbox layer. Fix by adding `interactiveLayerIds={['house-circles']}` to the `Map` component and handling layer clicks in the existing `onClick` handler.

- [ ] **Step 1: Update `components/map/MapView.tsx`**

```tsx
'use client'
import Map, { NavigationControl } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAPBOX_TOKEN } from '@/lib/mapbox'
import { NeighborhoodLayer } from './NeighborhoodLayer'
import { HousePins } from './HousePins'
import { useState } from 'react'
import type { House, Neighborhood } from '@/lib/db/schema'

type Props = {
  neighborhoods: (Neighborhood & { boundary: GeoJSON.Polygon })[]
  houses: House[]
  onHouseClick: (house: House) => void
  onMapClick?: (lat: number, lng: number) => void
}

export default function MapView({ neighborhoods, houses, onHouseClick, onMapClick }: Props) {
  const [viewport, setViewport] = useState({
    longitude: -98.5795,
    latitude: 39.8283,
    zoom: 10,
  })

  return (
    <Map
      {...viewport}
      onMove={e => setViewport(e.viewState)}
      mapboxAccessToken={MAPBOX_TOKEN}
      mapStyle="mapbox://styles/mapbox/streets-v12"
      style={{ width: '100%', height: '100%' }}
      interactiveLayerIds={['house-circles']}
      onClick={e => {
        // If the click landed on a house pin, open the panel
        const feature = e.features?.[0]
        if (feature?.layer?.id === 'house-circles') {
          const house = houses.find(h => h.id === feature.properties?.id)
          if (house) { onHouseClick(house); return }
        }
        // Otherwise pass the coordinates to the parent (tap-to-add-house)
        onMapClick?.(e.lngLat.lat, e.lngLat.lng)
      }}
    >
      <NavigationControl position="top-right" />
      <NeighborhoodLayer neighborhoods={neighborhoods} />
      <HousePins houses={houses} onHouseClick={onHouseClick} />
    </Map>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/map/MapView.tsx
git commit -m "fix: wire house pin click events via interactiveLayerIds"
```

---

## Task 9: Add Tap-to-Add-House Flow

**Files:**
- Create: `components/forms/HouseForm.tsx`
- Modify: `components/map/MapShell.tsx`

When a rep taps empty map space, `onMapClick` fires with coordinates. `MapShell` should capture these, show a form asking for an address, then POST to `/api/houses`. On success, call `router.refresh()` to re-fetch houses from the server.

- [ ] **Step 1: Create `components/forms/HouseForm.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  lat: number
  lng: number
  onSubmit: (address: string) => Promise<void>
  onCancel: () => void
}

export function HouseForm({ lat, lng, onSubmit, onCancel }: Props) {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!address.trim()) return
    setLoading(true)
    await onSubmit(address.trim())
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pin dropped at {lat.toFixed(5)}, {lng.toFixed(5)}
      </p>
      <div>
        <Label>Street Address</Label>
        <Input
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="123 Main St, City, ST 12345"
          autoFocus
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={loading || !address.trim()} className="flex-1">
          {loading ? 'Adding...' : 'Add House'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Rewrite `components/map/MapShell.tsx`**

```tsx
'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { HousePanel } from './HousePanel'
import { HouseForm } from '@/components/forms/HouseForm'
import type { House, Neighborhood } from '@/lib/db/schema'

const MapView = dynamic(() => import('./MapView'), { ssr: false })

type Props = {
  neighborhoods: (Neighborhood & { boundary: GeoJSON.Polygon })[]
  houses: (House & { lastOutcome?: string | null })[]
  userRole: string
}

export function MapShell({ neighborhoods, houses, userRole }: Props) {
  const router = useRouter()
  const [selectedHouse, setSelectedHouse] = useState<House | null>(null)
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  async function handleAddHouse(address: string) {
    if (!pendingLocation) return
    setAddError(null)
    const res = await fetch('/api/houses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, lat: pendingLocation.lat, lng: pendingLocation.lng }),
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
      <Sheet open={!!pendingLocation} onOpenChange={open => !open && setPendingLocation(null)}>
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

- [ ] **Step 3: Commit**

```bash
git add components/forms/HouseForm.tsx components/map/MapShell.tsx
git commit -m "feat: add tap-to-add-house flow from map"
```

---

## Task 10: Fix DrawControl draw.update

**Files:**
- Modify: `components/map/DrawControl.tsx`

Only `draw.create` is handled. If the user draws a polygon then edits its vertices, `onDrawComplete` fires with the pre-edit version. Add a `draw.update` listener mirroring the `draw.create` handler.

- [ ] **Step 1: Update `components/map/DrawControl.tsx`**

```tsx
'use client'
import { useEffect, useRef } from 'react'
import { useMap } from 'react-map-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'

type Props = {
  onDrawComplete: (polygon: GeoJSON.Polygon) => void
}

export function DrawControl({ onDrawComplete }: Props) {
  const { current: map } = useMap()
  const drawRef = useRef<MapboxDraw | null>(null)

  useEffect(() => {
    if (!map) return
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
    })
    map.addControl(draw)
    drawRef.current = draw

    const handleCreate = (e: any) => {
      const polygon = e.features[0]?.geometry as GeoJSON.Polygon
      if (polygon) onDrawComplete(polygon)
    }
    const handleUpdate = (e: any) => {
      const polygon = e.features[0]?.geometry as GeoJSON.Polygon
      if (polygon) onDrawComplete(polygon)
    }
    map.on('draw.create', handleCreate)
    map.on('draw.update', handleUpdate)

    return () => {
      map.off('draw.create', handleCreate)
      map.off('draw.update', handleUpdate)
      map.removeControl(draw)
    }
  }, [map])

  return null
}
```

- [ ] **Step 2: Commit**

```bash
git add components/map/DrawControl.tsx
git commit -m "fix: handle draw.update so polygon edits are captured"
```

---

## Task 11: Fix CSV Import Concurrency

**Files:**
- Modify: `app/api/houses/import/route.ts`

`Promise.allSettled` fires all geocode requests in parallel. A 500-row CSV fires 500 simultaneous Mapbox API requests, hitting rate limits. Process in batches of 10.

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
  const coords = await geocodeAddress(address)
  if (!coords) return null

  const neighborhoodResult = await db.execute(
    sql`SELECT id FROM neighborhoods
        WHERE ST_Within(ST_SetSRID(ST_Point(${coords.lng}, ${coords.lat}), 4326), boundary)
        LIMIT 1`
  )
  const neighborhoodId = neighborhoodResult.rows[0]?.id as string | null

  const [house] = await db.insert(houses).values({
    address,
    lat: coords.lat,
    lng: coords.lng,
    neighborhoodId,
  }).onConflictDoNothing().returning()
  return house ?? null
}

// Expects multipart form with a CSV file
// CSV format: address (one per line, no header required)
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

- [ ] **Step 2: Commit**

```bash
git add app/api/houses/import/route.ts
git commit -m "fix: batch CSV geocoding requests to avoid Mapbox rate limits"
```

---

## Task 12: Minor Polish

**Files:**
- Modify: `app/layout.tsx`, `components/forms/VisitForm.tsx`

- [ ] **Step 1: Fix app metadata in `app/layout.tsx`**

Replace lines 15–18:

```typescript
export const metadata: Metadata = {
  title: 'Door to Door',
  description: 'Field sales platform for door-to-door teams',
}
```

- [ ] **Step 2: Add `serviceDate` field to `components/forms/VisitForm.tsx`**

Add a `serviceDate` state variable (after `installDate`) and a corresponding input in the JSX. Also pass `serviceDate` in `onSubmit`.

Replace the `installDate` state line (line 37):

```tsx
  const [installDate, setInstallDate] = useState('')
  const [serviceDate, setServiceDate] = useState('')
```

Replace the `onSubmit` call body (lines 43–53):

```tsx
    await onSubmit({
      householdId,
      contactStatus,
      interestLevel: interestLevel as VisitFormData['interestLevel'] || undefined,
      notes: notes || undefined,
      followUpAt: followUpAt || undefined,
      saleOutcome: saleOutcome as VisitFormData['saleOutcome'] || undefined,
      productId: productId || undefined,
      installDate: installDate || undefined,
      serviceDate: serviceDate || undefined,
    })
```

Replace the install date input block (lines 106–109):

```tsx
              <div>
                <Label>Install Date</Label>
                <Input type="date" value={installDate} onChange={e => setInstallDate(e.target.value)} />
              </div>
              <div>
                <Label>Service Date</Label>
                <Input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)} />
              </div>
```

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx components/forms/VisitForm.tsx
git commit -m "fix: update app metadata, add serviceDate field to VisitForm"
```

---

## Self-Review

**Spec coverage check:**

| Issue | Task |
|---|---|
| SQL injection in neighborhoods PATCH | Task 3 |
| assertRole throws unhandled 500 | Task 1 + Task 2 |
| Dashboard loopback fetch fails on Cloudflare | Task 4 |
| accounts camelCase mismatch | Task 5 |
| GET /api/houses not scoped for reps | Task 6 |
| No input validation on POSTs | Task 6 |
| HousePanel silent fetch errors | Task 7 |
| House pin clicks don't work | Task 8 |
| Tap-to-add-house missing | Task 9 |
| draw.update not handled | Task 10 |
| CSV geocoding hits rate limits | Task 11 |
| App metadata boilerplate | Task 12 |
| serviceDate missing from VisitForm | Task 12 |
| assertRole/requireRole duplicate | Task 1 |
| useEffect missing dependency in HousePanel | Task 7 |
| saleOutcome enum: `follow_up` vs `pending` | No change — `follow_up` is intentional and used consistently in schema + UI |
| accounts primary key missing from migration | Not an issue — migration 0001 adds it |
| Node modules not installed | Cannot fix in code — run `npm install` before deploying |
| Admin UI CRUD (users/teams/products read-only) | Out of scope for this plan — tracked as known gap |
