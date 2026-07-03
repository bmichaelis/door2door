export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { statuses } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { isValidHexColor } from '@/lib/statuses'
import { eq } from 'drizzle-orm'

export const PATCH = withErrorHandling(async (req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const { id } = await params
  const body = await req.json()

  const [existing] = await db.select().from(statuses).where(eq(statuses.id, id))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (existing.autoKey && body.active === false) {
    return NextResponse.json({ error: 'System statuses cannot be deactivated' }, { status: 400 })
  }
  if (body.color !== undefined && !isValidHexColor(body.color)) {
    return NextResponse.json({ error: 'color must be a 6-digit hex color like #22c55e' }, { status: 400 })
  }

  const updates: Partial<typeof statuses.$inferInsert> = {}
  if (body.name !== undefined) {
    if (!body.name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    updates.name = body.name
  }
  if (body.color !== undefined) updates.color = body.color
  if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder)
  if (body.active !== undefined) updates.active = Boolean(body.active)

  const [status] = await db.update(statuses).set(updates).where(eq(statuses.id, id)).returning()
  return NextResponse.json(status)
})

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const { id } = await params

  const [existing] = await db.select().from(statuses).where(eq(statuses.id, id))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.autoKey) {
    return NextResponse.json({ error: 'System statuses cannot be deleted' }, { status: 400 })
  }

  // FK on houses/businesses is ON DELETE SET NULL — references clear themselves
  await db.delete(statuses).where(eq(statuses.id, id))
  return new NextResponse(null, { status: 204 })
})
