import { db } from '@/lib/db'
import { accounts } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { addMinutesLocal } from './local-time'

export const ORG_TIMEZONE = 'America/Denver'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

/** A valid Calendar-scoped access token for the user, refreshing (and
 * persisting) when expired. Null when the user hasn't granted the scope,
 * has no refresh token, or refresh fails — callers skip sync silently. */
export async function getGoogleAccessToken(userId: string): Promise<string | null> {
  const [account] = await db.select().from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'google')))
  if (!account?.scope?.includes(CALENDAR_SCOPE)) return null

  const now = Math.floor(Date.now() / 1000)
  if (account.access_token && account.expires_at && account.expires_at > now + 60) {
    return account.access_token
  }
  if (!account.refresh_token) return null

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: account.refresh_token,
      }),
    })
    if (!res.ok) return null
    const data = await res.json() as { access_token: string; expires_in: number }
    await db.update(accounts)
      .set({ access_token: data.access_token, expires_at: Math.floor(Date.now() / 1000) + data.expires_in })
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'google')))
    return data.access_token
  } catch {
    return null
  }
}

export async function createCalendarEvent(
  token: string,
  event: { summary: string; description?: string; startLocal: string },
): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description ?? '',
        start: { dateTime: event.startLocal, timeZone: ORG_TIMEZONE },
        end: { dateTime: addMinutesLocal(event.startLocal, 60), timeZone: ORG_TIMEZONE },
      }),
    })
    if (!res.ok) return null
    const data = await res.json() as { id?: string }
    return data.id ?? null
  } catch {
    return null
  }
}

export async function deleteCalendarEvent(token: string, eventId: string): Promise<void> {
  try {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    // best-effort — a stranded event is acceptable
  }
}
