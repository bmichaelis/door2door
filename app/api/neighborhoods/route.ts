export const runtime = 'edge'
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
    sql`SELECT n.id, n.name, n.team_id, n.created_at,
        ST_AsGeoJSON(n.boundary)::json as boundary,
        COUNT(h.id)::int as "houseCount"
        FROM neighborhoods n
        LEFT JOIN houses h ON h.neighborhood_id = n.id
        GROUP BY n.id
        ORDER BY n.name`
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
    sql`INSERT INTO neighborhoods (name, city, team_id, boundary)
        VALUES (${body.name}, ${body.city ?? null}, ${body.teamId ?? null}, ST_GeomFromGeoJSON(${geojson}))
        RETURNING id, name, city, team_id, created_at,
        ST_AsGeoJSON(boundary)::json as boundary`
  )
  return NextResponse.json(rows.rows[0], { status: 201 })
})
