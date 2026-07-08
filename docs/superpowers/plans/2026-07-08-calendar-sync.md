# Google Calendar Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Booking an appointment creates a 60-minute event on the booking rep's primary Google Calendar; cancelling deletes it. Best-effort — sync can never block or fail a booking.

**Architecture:** Google provider gains the calendar scope + offline access with an `events.signIn` handler persisting rotated tokens (adapters only write tokens on FIRST sign-in). `lib/google-calendar.ts` holds token refresh + Calendar API calls; `lib/local-time.ts` holds pure wall-clock helpers (separate module so tests don't import `db`). Route hooks mirror the visit auto-set pattern.

**Tech Stack:** Next.js 15 edge, Auth.js v5 + DrizzleAdapter, Google Calendar API v3, Neon + drizzle, vitest.

**Spec:** `docs/superpowers/specs/2026-07-08-calendar-sync-design.md`

## Global Constraints

- Code style: no semicolons, single quotes, 2-space indent.
- Migration journal `when` MUST be `1783467229017` (exceeds 0013's `1783437652444`).
- `ORG_TIMEZONE = 'America/Denver'`; events are 60 minutes; scope string exactly `'openid email profile https://www.googleapis.com/auth/calendar.events'`; refresh at <60s validity; never null an existing refresh_token.
- Sync failures are caught and logged (`console.error('calendar sync failed', e)`), never thrown.
- Gates: `npx tsc --noEmit`, `npm run test:run` (single env-only `lib/auth.test.ts` failure expected), `next build`. NO lint (issue #15).
- Commits reference `#27`. Migration apply: copy `/home/ubuntu/repos/door2door/.env.local` into the worktree, then `node --env-file=.env.local /home/ubuntu/repos/door2door/node_modules/.bin/drizzle-kit migrate`.

---

### Task 1: Auth scope + token plumbing + calendar client (TDD for `lib/local-time.ts`)

**Files:**
- Modify: `lib/auth.ts`
- Create: `lib/local-time.ts`
- Create: `lib/local-time.test.ts`
- Create: `lib/google-calendar.ts`

**Interfaces:**
- Produces: `normalizeLocal(dt: string): string` and `addMinutesLocal(dt: string, minutes: number): string` from `@/lib/local-time` (pure, no imports); `ORG_TIMEZONE`, `getGoogleAccessToken(userId)`, `createCalendarEvent(token, { summary, description?, startLocal })`, `deleteCalendarEvent(token, eventId)` from `@/lib/google-calendar` (server-only).

- [ ] **Step 1: Failing tests** — create `lib/local-time.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeLocal, addMinutesLocal } from './local-time'

describe('normalizeLocal', () => {
  it('appends seconds when missing', () => {
    expect(normalizeLocal('2026-07-10T14:30')).toBe('2026-07-10T14:30:00')
  })

  it('leaves full timestamps untouched', () => {
    expect(normalizeLocal('2026-07-10T14:30:45')).toBe('2026-07-10T14:30:45')
  })
})

describe('addMinutesLocal', () => {
  it('adds minutes within an hour', () => {
    expect(addMinutesLocal('2026-07-10T14:30:00', 60)).toBe('2026-07-10T15:30:00')
  })

  it('rolls over midnight', () => {
    expect(addMinutesLocal('2026-07-10T23:30:00', 60)).toBe('2026-07-11T00:30:00')
  })

  it('rolls over month ends', () => {
    expect(addMinutesLocal('2026-07-31T23:30:00', 60)).toBe('2026-08-01T00:30:00')
  })

  it('accepts input without seconds', () => {
    expect(addMinutesLocal('2026-07-10T14:30', 60)).toBe('2026-07-10T15:30:00')
  })
})
```

- [ ] **Step 2: RED** — `npm run test:run -- lib/local-time.test.ts` — FAIL.

- [ ] **Step 3: Implement `lib/local-time.ts`**:

```ts
// Pure wall-clock helpers for zone-less local timestamps ('YYYY-MM-DDTHH:MM[:SS]').
// Uses Date.UTC purely as a calendar calculator — the runtime timezone never leaks in.

export function normalizeLocal(dt: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dt) ? `${dt}:00` : dt
}

export function addMinutesLocal(dt: string, minutes: number): string {
  const [datePart, timePart] = normalizeLocal(dt).split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const [hh, mm, ss] = timePart.split(':').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d, hh, mm + minutes, ss))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`
}
```

- [ ] **Step 4: GREEN** — `npm run test:run -- lib/local-time.test.ts` — PASS (6 tests).

- [ ] **Step 5: Implement `lib/google-calendar.ts`**:

```ts
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
```

- [ ] **Step 6: Modify `lib/auth.ts`** — two changes:

1. Replace the Google provider entry with:

```ts
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar.events',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
```

2. Add after the `callbacks` block (sibling key in the NextAuth config), plus `import { and, eq } from 'drizzle-orm'` at the top:

```ts
  events: {
    // Database adapters only persist tokens on FIRST sign-in (linkAccount);
    // subsequent logins rotate tokens that would otherwise be lost. Persist
    // them ourselves — without this, re-consent never reaches the DB.
    async signIn({ account }) {
      if (account?.provider !== 'google') return
      const updates: Partial<typeof accounts.$inferInsert> = {
        access_token: account.access_token ?? null,
        expires_at: account.expires_at ?? null,
      }
      // Only update scope/refresh_token when present — a login response that
      // omits them must never wipe a previously granted value
      if (account.scope) updates.scope = account.scope
      if (account.refresh_token) updates.refresh_token = account.refresh_token
      await db.update(accounts).set(updates).where(
        and(eq(accounts.provider, 'google'), eq(accounts.providerAccountId, account.providerAccountId))
      )
    },
  },
```

- [ ] **Step 7: Verify** — `npx tsc --noEmit && npm run test:run` — clean / pass (the pre-existing env-only `lib/auth.test.ts` failure is unchanged in kind).

- [ ] **Step 8: Commit**

```bash
git add lib/auth.ts lib/local-time.ts lib/local-time.test.ts lib/google-calendar.ts
git commit -m "feat: calendar scope, token persistence, and Google Calendar client (#27)"
```

---

### Task 2: Migration 0014 + booking/cancel sync hooks

**Files:**
- Modify: `lib/db/schema.ts` (+ `lib/db/schema.test.ts`)
- Create: `lib/db/migrations/0014_calendar_sync.sql`
- Modify: `lib/db/migrations/meta/_journal.json`
- Modify: `app/api/appointments/route.ts`
- Modify: `app/api/appointments/[id]/route.ts`

**Interfaces:**
- Consumes: Task 1's `getGoogleAccessToken` / `createCalendarEvent` / `deleteCalendarEvent`, `normalizeLocal`.
- Produces: `appointments.googleEventId` column.

- [ ] **Step 1: Failing schema test** — append inside the describe in `lib/db/schema.test.ts`:

```ts
  it('appointments have a google event id column', () => {
    expect((appointments.googleEventId as { name: string }).name).toBe('google_event_id')
  })
```

- [ ] **Step 2: RED** — `npm run test:run -- lib/db/schema.test.ts` — FAIL.

- [ ] **Step 3: Schema** — in the `appointments` table add after `status`:

```ts
  googleEventId: text('google_event_id'),
```

- [ ] **Step 4: GREEN**, then migration `lib/db/migrations/0014_calendar_sync.sql`:

```sql
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "google_event_id" text;
```

Journal entry after idx 13:

```json
    {
      "idx": 14,
      "version": "7",
      "when": 1783467229017,
      "tag": "0014_calendar_sync",
      "breakpoints": true
    }
```

Apply per Global Constraints (skip + note if env missing).

- [ ] **Step 5: Booking hook** — in `app/api/appointments/route.ts`: add imports `import { eq, sql } from 'drizzle-orm'`, `import { getGoogleAccessToken, createCalendarEvent } from '@/lib/google-calendar'`, `import { normalizeLocal } from '@/lib/local-time'`. In POST, between the insert and the `return`, add:

```ts
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
        await db.update(appointments).set({ googleEventId: eventId }).where(eq(appointments.id, appointment.id))
        appointment.googleEventId = eventId
      }
    }
  } catch (e) {
    console.error('calendar sync failed', e)
  }
```

- [ ] **Step 6: Cancel hook** — in `app/api/appointments/[id]/route.ts`: add imports `import { getGoogleAccessToken, deleteCalendarEvent } from '@/lib/google-calendar'`. In PATCH, after the 404 check and before the `return`, add:

```ts
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
```

- [ ] **Step 7: Verify** — `npx tsc --noEmit && npm run test:run` — clean / pass.

- [ ] **Step 8: Commit**

```bash
git add lib/db app/api/appointments
git commit -m "feat: sync appointments to Google Calendar on book and cancel (#27)"
```

---

### Task 3: Gates

- [ ] **Step 1:** `npx tsc --noEmit && npm run test:run && AUTH_GOOGLE_ID=dummy AUTH_GOOGLE_SECRET=dummy AUTH_SECRET=dummy DATABASE_URL='postgresql://dummy:dummy@localhost:5432/dummy' npm run build` — clean / pass / build succeeds.
- [ ] **Step 2:** Fix anything found (`fix: post-verification fixes for calendar sync (#27)`), or skip.

---

## Self-Review Notes

- **Spec coverage:** provider params + events.signIn token persistence (T1 step 6); token refresh with 60s skew + persist, create/delete API calls, ORG_TIMEZONE (T1 step 5); pure local-time helpers TDD'd in a db-free module (T1 steps 1–4); column + migration + both hooks with the booker's-token semantics on cancel (T2). Out-of-scope items have no tasks.
- **Type consistency:** `normalizeLocal(body.scheduledAt)` — `scheduledAt` was validated parseable earlier in POST; `appointment.googleEventId` mutation after `.returning()` keeps the response accurate.
- **Deliberate risk noted:** the Calendar network calls are untestable here (no harness, external API) — verified by the post-deploy smoke in the PR body.
