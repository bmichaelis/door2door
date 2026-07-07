export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tags } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { normalizeTagName } from '@/lib/tags'
import { eq, sql } from 'drizzle-orm'

export const PATCH = withErrorHandling(async (req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const { id } = await params
  const body = await req.json()

  const name = normalizeTagName(body.name ?? '')
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const [existing] = await db.select().from(tags).where(eq(tags.id, id))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const collision = await db.execute(
    sql`SELECT id FROM tags WHERE lower(name) = lower(${name}) AND id != ${id} LIMIT 1`
  )
  if (collision.rows[0]) {
    return NextResponse.json({ error: 'A tag with that name already exists' }, { status: 409 })
  }

  const [tag] = await db.update(tags).set({ name }).where(eq(tags.id, id)).returning()
  return NextResponse.json(tag)
})

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const { id } = await params

  const [existing] = await db.select().from(tags).where(eq(tags.id, id))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Join rows cascade via FK
  await db.delete(tags).where(eq(tags.id, id))
  return new NextResponse(null, { status: 204 })
})
