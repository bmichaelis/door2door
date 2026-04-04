import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { houses } from '@/lib/db/schema'
import { assertRole, canSetDoNotKnock } from '@/lib/permissions'
import { eq } from 'drizzle-orm'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  assertRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { id } = await params
  const body = await req.json()
  const role = session!.user!.role

  const updates: Partial<typeof houses.$inferInsert> = {}
  if (body.address !== undefined) updates.address = body.address
  if (body.noSolicitingSign !== undefined) updates.noSolicitingSign = body.noSolicitingSign
  if (body.doNotKnock !== undefined) {
    if (!canSetDoNotKnock(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    updates.doNotKnock = body.doNotKnock
  }

  const [house] = await db.update(houses).set(updates).where(eq(houses.id, id)).returning()
  if (!house) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(house)
}
