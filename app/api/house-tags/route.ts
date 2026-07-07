export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { houseTags } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { getOrCreateTag } from '@/lib/tags-server'
import { and, eq, sql } from 'drizzle-orm'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const houseId = new URL(req.url).searchParams.get('houseId')
  if (!houseId) return NextResponse.json({ error: 'houseId required' }, { status: 400 })

  const rows = await db.execute(sql`
    SELECT ht.tag_id AS "tagId", t.name
    FROM house_tags ht JOIN tags t ON t.id = ht.tag_id
    WHERE ht.house_id = ${houseId} ORDER BY t.name`)
  return NextResponse.json(rows.rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const body = await req.json()
  if (!body.houseId) return NextResponse.json({ error: 'houseId required' }, { status: 400 })

  const tag = await getOrCreateTag(body.name ?? '')
  if (!tag) return NextResponse.json({ error: 'name required' }, { status: 400 })

  await db.insert(houseTags)
    .values({ houseId: body.houseId, tagId: tag.id, userId: session!.user!.id })
    .onConflictDoNothing()
  return NextResponse.json({ tagId: tag.id, name: tag.name }, { status: 201 })
})

export const DELETE = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { searchParams } = new URL(req.url)
  const houseId = searchParams.get('houseId')
  const tagId = searchParams.get('tagId')
  if (!houseId || !tagId) {
    return NextResponse.json({ error: 'houseId and tagId required' }, { status: 400 })
  }

  await db.delete(houseTags).where(and(eq(houseTags.houseId, houseId), eq(houseTags.tagId, tagId)))
  return new NextResponse(null, { status: 204 })
})
