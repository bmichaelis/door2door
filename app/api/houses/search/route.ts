export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql } from 'drizzle-orm'
import { tokenPatterns, ilikeAllTokens } from '@/lib/search'

// Shared column list
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
  ${sql.raw(alias)}.status_id           AS "statusId"
`

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (!q) return NextResponse.json([])

  const patterns = tokenPatterns(q)

  // Two separate trgm-indexed searches UNION'd together. Each branch keeps its
  // own expression so its trigram index applies; token AND-matching is an
  // AND-chain of per-token ILIKEs (BitmapAnd), never OR + lateral join.
  const rows = await db.execute(sql`
    (
      SELECT ${HOUSE_COLS()}, NULL::text AS surname, NULL::text AS "headOfHouseholdName", NULL::text AS "spouseName"
      FROM houses h
      WHERE ${ilikeAllTokens(sql`(h.number || ' ' || h.street)`, patterns)}
      ORDER BY h.street, h.number
      LIMIT 8
    )
    UNION
    (
      SELECT ${HOUSE_COLS()}, ho.surname, ho.head_of_household_name AS "headOfHouseholdName", ho.spouse_name AS "spouseName"
      FROM households ho
      JOIN houses h ON h.id = ho.house_id
      WHERE ${ilikeAllTokens(
        sql`(COALESCE(ho.surname, '') || ' ' || COALESCE(ho.head_of_household_name, '') || ' ' || COALESCE(ho.spouse_name, ''))`,
        patterns,
      )} AND ho.active = true
      ORDER BY h.street, h.number
      LIMIT 8
    )
    ORDER BY street, number
    LIMIT 8
  `)

  return NextResponse.json(rows.rows)
})
