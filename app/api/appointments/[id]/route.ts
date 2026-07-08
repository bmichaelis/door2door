export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { appointments } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { eq } from 'drizzle-orm'
import { getGoogleAccessToken, deleteCalendarEvent } from '@/lib/google-calendar'

const STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const

export const PATCH = withErrorHandling(async (req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { id } = await params
  const body = await req.json()

  if (!STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'status must be scheduled, completed, cancelled, or no_show' }, { status: 400 })
  }

  const [appointment] = await db.update(appointments)
    .set({ status: body.status })
    .where(eq(appointments.id, id))
    .returning()
  if (!appointment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Best-effort: cancellation removes the calendar event (booker's calendar)
  if (body.status === 'cancelled' && appointment.googleEventId && appointment.userId) {
    try {
      const token = await getGoogleAccessToken(appointment.userId)
      if (token) await deleteCalendarEvent(token, appointment.googleEventId)
      await db.update(appointments).set({ googleEventId: null }).where(eq(appointments.id, id))
      appointment.googleEventId = null
    } catch (e) {
      console.error('calendar sync failed', e)
    }
  }

  return NextResponse.json(appointment)
})
