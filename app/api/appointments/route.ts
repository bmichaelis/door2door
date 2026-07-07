export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { appointments } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { getAgenda } from '@/lib/appointments-server'

export const GET = withErrorHandling(async () => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { role, id, teamId } = session!.user!
  const rows = await getAgenda({ role: role!, userId: id!, teamId: teamId ?? null })
  return NextResponse.json(rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const body = await req.json()

  const hasHouse = typeof body.houseId === 'string' && body.houseId.length > 0
  const hasBusiness = typeof body.businessId === 'string' && body.businessId.length > 0
  if (hasHouse === hasBusiness) {
    return NextResponse.json({ error: 'exactly one of houseId or businessId required' }, { status: 400 })
  }
  const when = new Date(body.scheduledAt ?? '')
  if (Number.isNaN(when.getTime())) {
    return NextResponse.json({ error: 'scheduledAt must be a valid date-time' }, { status: 400 })
  }

  const [appointment] = await db.insert(appointments).values({
    houseId: hasHouse ? body.houseId : null,
    businessId: hasBusiness ? body.businessId : null,
    userId: session!.user!.id,
    scheduledAt: when,
    notes: body.notes?.trim() || null,
  }).returning()
  return NextResponse.json(appointment, { status: 201 })
})
