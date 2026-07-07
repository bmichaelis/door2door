export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { houseNotes } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql } from 'drizzle-orm'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const houseId = new URL(req.url).searchParams.get('houseId')
  if (!houseId) return NextResponse.json({ error: 'houseId required' }, { status: 400 })

  const rows = await db.execute(sql`
    SELECT n.id, n.body, n.user_id AS "userId", n.created_at AS "createdAt",
      COALESCE(u.name, 'Unknown') AS "authorName"
    FROM house_notes n LEFT JOIN users u ON u.id = n.user_id
    WHERE n.house_id = ${houseId} ORDER BY n.created_at DESC`)
  return NextResponse.json(rows.rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const body = await req.json()
  if (!body.houseId) return NextResponse.json({ error: 'houseId required' }, { status: 400 })
  const text = (body.body ?? '').trim()
  if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const [note] = await db.insert(houseNotes).values({
    houseId: body.houseId,
    userId: session!.user!.id,
    body: text,
  }).returning()
  return NextResponse.json(
    { ...note, authorName: session!.user!.name ?? 'Unknown' },
    { status: 201 }
  )
})
