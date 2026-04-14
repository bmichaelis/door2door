export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql } from 'drizzle-orm'

const BUSINESS_COLS = sql`
  businesses.id, businesses.name, businesses.type, businesses.category,
  businesses.number, businesses.street, businesses.city, businesses.region,
  businesses.postcode, businesses.phone, businesses.website,
  businesses.external_id as "externalId",
  ST_Y(businesses.location) as lat, ST_X(businesses.location) as lng,
  businesses.neighborhood_id as "neighborhoodId",
  businesses.created_at as "createdAt"
`

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { role, teamId } = session!.user!
  const { searchParams } = new URL(req.url)
  const neighborhoodId = searchParams.get('neighborhoodId')

  if (role === 'admin') {
    const query = neighborhoodId
      ? sql`SELECT ${BUSINESS_COLS} FROM businesses WHERE businesses.neighborhood_id = ${neighborhoodId}`
      : sql`SELECT ${BUSINESS_COLS} FROM businesses`
    const rows = await db.execute(query)
    return NextResponse.json(rows.rows)
  }

  if (!teamId) return NextResponse.json([])

  const query = neighborhoodId
    ? sql`SELECT ${BUSINESS_COLS} FROM businesses
          JOIN neighborhoods n ON businesses.neighborhood_id = n.id
          WHERE n.team_id = ${teamId} AND businesses.neighborhood_id = ${neighborhoodId}`
    : sql`SELECT ${BUSINESS_COLS} FROM businesses
          JOIN neighborhoods n ON businesses.neighborhood_id = n.id
          WHERE n.team_id = ${teamId}`
  const rows = await db.execute(query)
  return NextResponse.json(rows.rows)
})
