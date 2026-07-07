export const runtime = 'edge'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql } from 'drizzle-orm'

export const GET = withErrorHandling(async () => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager')
  const { role, teamId } = session!.user!

  const teamFilter = role === 'manager' ? sql`AND u.team_id = ${teamId ?? null}` : sql``
  const rows = await db.execute(sql`
    SELECT x.user_id AS "userId", u.name AS "repName",
      x.lat, x.lng,
      to_char(x.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS at
    FROM (
      SELECT v.user_id, v.created_at, ST_Y(h.location) AS lat, ST_X(h.location) AS lng
      FROM visits v
      JOIN households ho ON ho.id = v.household_id
      JOIN houses h ON h.id = ho.house_id
      WHERE v.created_at >= CURRENT_DATE
      UNION ALL
      SELECT bv.user_id, bv.created_at, ST_Y(b.location) AS lat, ST_X(b.location) AS lng
      FROM business_visits bv
      JOIN businesses b ON b.id = bv.business_id
      WHERE bv.created_at >= CURRENT_DATE
    ) x
    JOIN users u ON u.id = x.user_id
    WHERE true ${teamFilter}
    ORDER BY x.created_at ASC
  `)
  return NextResponse.json(rows.rows)
})
