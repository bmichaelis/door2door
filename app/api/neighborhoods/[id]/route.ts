export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { neighborhoods, users } from '@/lib/db/schema'
import { requireRole, canManageTeam } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql, eq } from 'drizzle-orm'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  if ('assignedUserId' in body) {
    if (body.assignedUserId !== null) {
      if (typeof body.assignedUserId !== 'string' || !UUID_RE.test(body.assignedUserId)) {
        return NextResponse.json({ error: 'assignedUserId must be a user id or null' }, { status: 400 })
      }
      const [assignee] = await db.select({ role: users.role, teamId: users.teamId })
        .from(users).where(eq(users.id, body.assignedUserId))
      if (!assignee || assignee.role !== 'rep') {
        return NextResponse.json({ error: 'assignedUserId must be a rep' }, { status: 400 })
      }
      if (role !== 'admin' && assignee.teamId !== existing.teamId) {
        return NextResponse.json({ error: 'assignee must be on the neighborhood team' }, { status: 400 })
      }
    }
    scalarUpdates.assignedUserId = body.assignedUserId
  }
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

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const { id } = await params
  // Unassign houses before deleting to avoid FK violation
  await db.execute(sql`UPDATE houses SET neighborhood_id = NULL WHERE neighborhood_id = ${id}`)
  await db.delete(neighborhoods).where(eq(neighborhoods.id, id))
  return new NextResponse(null, { status: 204 })
})
