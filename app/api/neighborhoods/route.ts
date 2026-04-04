import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { assertRole } from '@/lib/permissions'
import { sql } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  assertRole(session?.user?.role, 'admin', 'manager', 'rep')

  const rows = await db.execute(
    sql`SELECT id, name, team_id, created_at,
        ST_AsGeoJSON(boundary)::json as boundary
        FROM neighborhoods ORDER BY name`
  )
  return NextResponse.json(rows.rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  assertRole(session?.user?.role, 'admin')
  const body = await req.json()
  const geojson = JSON.stringify(
    body.boundary.type === 'Feature' ? body.boundary.geometry : body.boundary
  )
  const rows = await db.execute(
    sql`INSERT INTO neighborhoods (name, team_id, boundary)
        VALUES (${body.name}, ${body.teamId ?? null}, ST_GeomFromGeoJSON(${geojson}))
        RETURNING id, name, team_id, created_at,
        ST_AsGeoJSON(boundary)::json as boundary`
  )
  return NextResponse.json(rows.rows[0], { status: 201 })
}
