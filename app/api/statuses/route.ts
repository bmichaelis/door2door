export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { statuses } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { isValidHexColor } from '@/lib/statuses'
import { sql } from 'drizzle-orm'

export const GET = withErrorHandling(async () => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  // All rows, including inactive: pins still need colors for houses that
  // kept a deactivated status. Clients filter on `active` for the chip row.
  const rows = await db.select().from(statuses).orderBy(statuses.sortOrder, statuses.createdAt)
  return NextResponse.json(rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!body.color || !isValidHexColor(body.color)) {
    return NextResponse.json({ error: 'color must be a 6-digit hex color like #22c55e' }, { status: 400 })
  }
  const next = await db.execute(sql`SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM statuses`)
  const [status] = await db.insert(statuses).values({
    name: body.name,
    color: body.color,
    sortOrder: Number(next.rows[0].next),
  }).returning()
  return NextResponse.json(status, { status: 201 })
})
