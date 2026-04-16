export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql } from 'drizzle-orm'

// Shared column list (no lastOutcome — computed per-branch below)
const HOUSE_COLS = (alias = 'h') => sql`
  ${sql.raw(alias)}.id,
  ${sql.raw(alias)}.number,
  ${sql.raw(alias)}.street,
  ${sql.raw(alias)}.unit,
  ${sql.raw(alias)}.city,
  ${sql.raw(alias)}.region,
  ${sql.raw(alias)}.postcode,
  ${sql.raw(alias)}.external_id       AS "externalId",
  ST_Y(${sql.raw(alias)}.location)    AS lat,
  ST_X(${sql.raw(alias)}.location)    AS lng,
  ${sql.raw(alias)}.neighborhood_id   AS "neighborhoodId",
  ${sql.raw(alias)}.do_not_knock      AS "doNotKnock",
  ${sql.raw(alias)}.no_soliciting_sign AS "noSolicitingSign",
  ${sql.raw(alias)}.created_at        AS "createdAt",
  (SELECT vi.sale_outcome FROM visits vi
   JOIN households ho2 ON vi.household_id = ho2.id
   WHERE ho2.house_id = ${sql.raw(alias)}.id
   ORDER BY vi.created_at DESC LIMIT 1) AS "lastOutcome"
`

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (!q) return NextResponse.json([])

  const pattern = '%' + q + '%'

  // Two separate trgm-indexed searches UNION'd together.
  // The old single query with OR + lateral join forced 243K lateral executions,
  // defeating the trigram index on surname entirely.
  const rows = await db.execute(sql`
    (
      SELECT ${HOUSE_COLS()}, NULL::text AS surname, NULL::text AS "headOfHouseholdName"
      FROM houses h
      WHERE (h.number || ' ' || h.street) ILIKE ${pattern}
      ORDER BY h.street, h.number
      LIMIT 8
    )
    UNION
    (
      SELECT ${HOUSE_COLS()}, ho.surname, ho.head_of_household_name AS "headOfHouseholdName"
      FROM households ho
      JOIN houses h ON h.id = ho.house_id
      WHERE ho.surname ILIKE ${pattern} AND ho.active = true
      ORDER BY h.street, h.number
      LIMIT 8
    )
    ORDER BY street, number
    LIMIT 8
  `)

  return NextResponse.json(rows.rows)
})
