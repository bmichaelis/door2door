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
