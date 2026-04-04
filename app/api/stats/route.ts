import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { assertRole } from '@/lib/permissions'
import { sql } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  assertRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { role, id: userId, teamId } = session!.user!

  if (role === 'rep') {
    const rows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE v.created_at >= CURRENT_DATE) as visits_today,
        COUNT(*) FILTER (WHERE v.created_at >= date_trunc('week', CURRENT_DATE)) as visits_this_week,
        COUNT(*) FILTER (WHERE v.sale_outcome = 'sold' AND v.created_at >= date_trunc('week', CURRENT_DATE)) as sales_this_week,
        COUNT(*) FILTER (WHERE v.follow_up_at IS NOT NULL AND v.follow_up_at >= NOW() AND v.follow_up_at < NOW() + INTERVAL '7 days') as follow_ups_due
      FROM visits v WHERE v.user_id = ${userId}
    `)
    return NextResponse.json(rows.rows[0])
  }

  if (role === 'manager') {
    const rows = await db.execute(sql`
      SELECT
        u.id, u.name,
        COUNT(v.id) FILTER (WHERE v.created_at >= date_trunc('week', CURRENT_DATE)) as visits_this_week,
        COUNT(v.id) FILTER (WHERE v.sale_outcome = 'sold' AND v.created_at >= date_trunc('week', CURRENT_DATE)) as sales_this_week
      FROM users u
      LEFT JOIN visits v ON v.user_id = u.id
      WHERE u.team_id = ${teamId}
      GROUP BY u.id, u.name
      ORDER BY u.name
    `)
    const coverage = await db.execute(sql`
      SELECT
        n.name,
        COUNT(DISTINCT h.id) as total_houses,
        COUNT(DISTINCT ho.house_id) FILTER (WHERE ho.id IS NOT NULL) as visited_houses
      FROM neighborhoods n
      LEFT JOIN houses h ON h.neighborhood_id = n.id
      LEFT JOIN households ho ON ho.house_id = h.id
      LEFT JOIN visits v ON v.household_id = ho.id
      WHERE n.team_id = ${teamId}
      GROUP BY n.id, n.name
    `)
    return NextResponse.json({ reps: rows.rows, coverage: coverage.rows })
  }

  // admin
  const rows = await db.execute(sql`
    SELECT
      t.name as team_name,
      COUNT(v.id) FILTER (WHERE v.created_at >= date_trunc('month', CURRENT_DATE)) as visits_this_month,
      COUNT(v.id) FILTER (WHERE v.sale_outcome = 'sold' AND v.created_at >= date_trunc('month', CURRENT_DATE)) as sales_this_month,
      p.name as top_product
    FROM teams t
    LEFT JOIN users u ON u.team_id = t.id
    LEFT JOIN visits v ON v.user_id = u.id
    LEFT JOIN products p ON v.product_id = p.id
    GROUP BY t.id, t.name, p.name
    ORDER BY t.name
  `)
  return NextResponse.json(rows.rows)
}
