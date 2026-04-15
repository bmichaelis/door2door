export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql } from 'drizzle-orm'

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
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (!q) return NextResponse.json([])

  const rows = await db.execute(sql`
    SELECT ${HOUSE_COLS}, _household.surname
    FROM houses
    ${LAST_VISIT_LATERAL}
    LEFT JOIN LATERAL (
      SELECT ho.surname FROM households ho
      WHERE ho.house_id = houses.id AND ho.active = true
      ORDER BY ho.created_at DESC LIMIT 1
    ) _household ON true
    WHERE
      (houses.number || ' ' || houses.street) ILIKE ${'%' + q + '%'}
      OR _household.surname ILIKE ${'%' + q + '%'}
    ORDER BY houses.street, houses.number
    LIMIT 8
  `)

  return NextResponse.json(rows.rows)
})
