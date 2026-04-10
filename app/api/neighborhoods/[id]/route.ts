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
  if (body.city !== undefined) scalarUpdates.city = body.city ?? null
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
  // Unassign houses before deleting to avoid FK violation
  await db.execute(sql`UPDATE houses SET neighborhood_id = NULL WHERE neighborhood_id = ${id}`)
  await db.delete(neighborhoods).where(eq(neighborhoods.id, id))
  return new NextResponse(null, { status: 204 })
})
