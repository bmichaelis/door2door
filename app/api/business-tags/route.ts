export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { businessTags } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { getOrCreateTag } from '@/lib/tags-server'
import { and, eq, sql } from 'drizzle-orm'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const businessId = new URL(req.url).searchParams.get('businessId')
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 })

  const rows = await db.execute(sql`
    SELECT bt.tag_id AS "tagId", t.name
    FROM business_tags bt JOIN tags t ON t.id = bt.tag_id
    WHERE bt.business_id = ${businessId} ORDER BY t.name`)
  return NextResponse.json(rows.rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const body = await req.json()
  if (!body.businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 })

  const tag = await getOrCreateTag(body.name ?? '')
  if (!tag) return NextResponse.json({ error: 'name required' }, { status: 400 })

  await db.insert(businessTags)
    .values({ businessId: body.businessId, tagId: tag.id, userId: session!.user!.id })
    .onConflictDoNothing()
  return NextResponse.json({ tagId: tag.id, name: tag.name }, { status: 201 })
})

export const DELETE = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { searchParams } = new URL(req.url)
  const businessId = searchParams.get('businessId')
  const tagId = searchParams.get('tagId')
  if (!businessId || !tagId) {
    return NextResponse.json({ error: 'businessId and tagId required' }, { status: 400 })
  }

  await db.delete(businessTags).where(and(eq(businessTags.businessId, businessId), eq(businessTags.tagId, tagId)))
  return new NextResponse(null, { status: 204 })
})
