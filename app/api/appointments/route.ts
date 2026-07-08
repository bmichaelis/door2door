export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { appointments } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { getAgenda } from '@/lib/appointments-server'
import { getGoogleAccessToken, createCalendarEvent } from '@/lib/google-calendar'
import { normalizeLocal } from '@/lib/local-time'

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

  // Best-effort Google Calendar sync — never blocks the booking
  try {
    const token = await getGoogleAccessToken(session!.user!.id!)
    if (token) {
      const labelRows = hasHouse
        ? await db.execute(sql`SELECT number || ' ' || street AS label FROM houses WHERE id = ${body.houseId}`)
        : await db.execute(sql`SELECT name AS label FROM businesses WHERE id = ${body.businessId}`)
      const eventId = await createCalendarEvent(token, {
        summary: `Appointment: ${(labelRows.rows[0]?.label as string | undefined) ?? 'door2door'}`,
        description: appointment.notes ?? '',
        startLocal: normalizeLocal(body.scheduledAt),
      })
      if (eventId) {
        await db.update(appointments)
          .set({ googleEventId: eventId })
          .where(and(eq(appointments.id, appointment.id), eq(appointments.status, 'scheduled')))
        appointment.googleEventId = eventId
      }
    }
  } catch (e) {
    console.error('calendar sync failed', e)
  }

  return NextResponse.json(appointment, { status: 201 })
})
