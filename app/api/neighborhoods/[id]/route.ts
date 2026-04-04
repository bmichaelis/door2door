import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { neighborhoods } from '@/lib/db/schema'
import { assertRole } from '@/lib/permissions'
import { sql, eq } from 'drizzle-orm'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  assertRole(session?.user?.role, 'admin')
  const { id } = await params
  const body = await req.json()

  const updates: string[] = []
  if (body.name) updates.push(`name = '${body.name}'`)
  if (body.teamId !== undefined) updates.push(`team_id = ${body.teamId ? `'${body.teamId}'` : 'NULL'}`)
  if (body.boundary) {
    const geojson = JSON.stringify(
      body.boundary.type === 'Feature' ? body.boundary.geometry : body.boundary
    )
    updates.push(`boundary = ST_GeomFromGeoJSON('${geojson}')`)
  }

  const rows = await db.execute(
    sql`UPDATE neighborhoods SET ${sql.raw(updates.join(', '))}
        WHERE id = ${id}
        RETURNING id, name, team_id, created_at,
        ST_AsGeoJSON(boundary)::json as boundary`
  )
  if (!rows.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(rows.rows[0])
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  assertRole(session?.user?.role, 'admin')
  const { id } = await params
  await db.delete(neighborhoods).where(eq(neighborhoods.id, id))
  return new NextResponse(null, { status: 204 })
}
