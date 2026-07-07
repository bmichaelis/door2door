export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { getOrCreateTag } from '@/lib/tags-server'
import { sql } from 'drizzle-orm'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const q = new URL(req.url).searchParams.get('q')?.trim()

  if (q) {
    const rows = await db.execute(
      sql`SELECT id, name FROM tags WHERE name ILIKE ${'%' + q + '%'} ORDER BY name LIMIT 10`
    )
    return NextResponse.json(rows.rows)
  }

  // Full list with usage counts — used by the admin page
  const rows = await db.execute(sql`
    SELECT t.id, t.name, t.created_at AS "createdAt",
      (SELECT COUNT(*) FROM house_tags ht WHERE ht.tag_id = t.id) +
      (SELECT COUNT(*) FROM business_tags bt WHERE bt.tag_id = t.id) AS "usageCount"
    FROM tags t ORDER BY t.name`)
  return NextResponse.json(rows.rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const body = await req.json()
  const tag = await getOrCreateTag(body.name ?? '')
  if (!tag) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const { created, ...row } = tag
  return NextResponse.json(row, { status: created ? 201 : 200 })
})
