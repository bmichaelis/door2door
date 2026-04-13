export const runtime = 'edge'
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
  houses.created_at as "createdAt",
  _last_visit.sale_outcome as "lastOutcome"
`

const LAST_VISIT_LATERAL = sql`
  LEFT JOIN LATERAL (
    SELECT vi.sale_outcome FROM visits vi
    JOIN households ho ON vi.household_id = ho.id
    WHERE ho.house_id = houses.id
    ORDER BY vi.created_at DESC LIMIT 1
  ) _last_visit ON true
`

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { role, teamId } = session!.user!
  const { searchParams } = new URL(req.url)
  const neighborhoodId = searchParams.get('neighborhoodId')

  if (role === 'admin') {
    const query = neighborhoodId
      ? sql`SELECT ${HOUSE_COLS} FROM houses ${LAST_VISIT_LATERAL} WHERE houses.neighborhood_id = ${neighborhoodId}`
      : sql`SELECT ${HOUSE_COLS} FROM houses ${LAST_VISIT_LATERAL}`
    const rows = await db.execute(query)
    return NextResponse.json(rows.rows)
  }

  if (!teamId) return NextResponse.json([])

  const query = neighborhoodId
    ? sql`SELECT ${HOUSE_COLS} FROM houses
          JOIN neighborhoods n ON houses.neighborhood_id = n.id
          ${LAST_VISIT_LATERAL}
          WHERE n.team_id = ${teamId} AND houses.neighborhood_id = ${neighborhoodId}`
    : sql`SELECT ${HOUSE_COLS} FROM houses
          JOIN neighborhoods n ON houses.neighborhood_id = n.id
          ${LAST_VISIT_LATERAL}
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
  }).returning({ id: houses.id })

  const row = await db.execute(
    sql`SELECT ${HOUSE_COLS} FROM houses WHERE houses.id = ${house.id}`
  )
  return NextResponse.json(row.rows[0], { status: 201 })
})
