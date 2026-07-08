# Google Calendar Sync — Design

**Issue:** #27 (phase 2 of #5) · **Date:** 2026-07-08 · **Status:** Approved
(user unblocked the OAuth scope; design decisions delegated, review via PR)

Booking an appointment creates a 60-minute event on the **booking rep's
primary Google Calendar**; cancelling deletes it. Sync is best-effort and can
never block or fail a booking — the exact pattern of visit status auto-set.

## Decisions (with rationale)

- **Rep's own primary calendar**, not a shared team calendar: zero extra
  configuration, matches "my appointments on my phone", and a team calendar
  can be added later as a second insert target.
- **60-minute events** — appointments deliberately have no duration column
  (#5 decision); 60 min is the field default and editable in Google.
- **Create on book, delete on cancel, leave on complete/no-show.** A
  completed appointment happened — its calendar record should survive.
- **`prompt: 'consent'` + `access_type: 'offline'` on every login.** Google
  only issues refresh tokens on consent; existing users' account rows have
  no refresh token. Cost: users see the Google consent screen each login.
  Accepted for v1; revisit if it annoys.
- **Token persistence via `events.signIn`**: Auth.js database adapters only
  `linkAccount` on first sign-in — subsequent logins do NOT update stored
  tokens. An explicit `events.signIn` handler upserts refresh/access/expiry/
  scope into the `accounts` row on every Google sign-in, so re-consent
  actually lands in the DB.
- **Org timezone constant** `ORG_TIMEZONE = 'America/Denver'` — appointments
  store zone-less wall time; the Calendar API accepts naive `dateTime` +
  explicit `timeZone`. Single-org tool in Utah; a per-team setting is YAGNI.
- **Missing/unauthorized token → skip silently.** Reps who haven't
  re-consented simply get no calendar events; nothing surfaces in the
  booking flow. (A "reconnect Google" nudge is a possible follow-up.)

## Data model

Migration `0014_calendar_sync` (journal `when` = `1783467229017`, exceeds
0013's `1783437652444`): `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS
"google_event_id" text;` — Drizzle: `googleEventId: text('google_event_id')`.

## Auth changes (`lib/auth.ts`)

- Google provider gains `authorization.params`: scope
  `'openid email profile https://www.googleapis.com/auth/calendar.events'`,
  `access_type: 'offline'`, `prompt: 'consent'`.
- `events.signIn`: when `account?.provider === 'google'`, update the
  matching `accounts` row's `refresh_token` (only when present — never null
  an existing one), `access_token`, `expires_at`, `scope`.

## `lib/google-calendar.ts` (server-only)

- `getGoogleAccessToken(userId): Promise<string | null>` — loads the google
  `accounts` row; null unless `scope` includes `calendar.events` and a
  refresh or valid access token exists; refreshes via
  `POST https://oauth2.googleapis.com/token` (`grant_type=refresh_token`,
  client id/secret from env) when `expires_at` is within 60s; persists the
  new access token + expiry; null on any failure.
- `createCalendarEvent(token, { summary, description, startLocal }):
  Promise<string | null>` — `POST /calendar/v3/calendars/primary/events`
  with `start`/`end` as `{ dateTime: startLocal, timeZone: ORG_TIMEZONE }`
  (end = start + 60 min computed on the wall-clock string); returns the
  event id or null.
- `deleteCalendarEvent(token, eventId): Promise<void>` — best-effort DELETE;
  404s ignored.
- Pure, exported, unit-tested helper: `addMinutesLocal(dateTimeLocal:
  string, minutes: number): string` (wall-clock arithmetic on
  `YYYY-MM-DDTHH:MM[:SS]` strings, no Date-timezone traps).

## Route hooks

- `POST /api/appointments`: after the insert, best-effort try/catch —
  token → look up entity label (house `number street` / business name; one
  small select) → `createCalendarEvent` (summary `Appointment: <label>`,
  description = notes ?? '') → on success, update the row's
  `googleEventId`. Response unchanged (plus the stored field naturally
  appearing on the returned row when set before return — implementation may
  return the row before sync completes; the field is not part of any UI
  contract).
- `PATCH /api/appointments/[id]`: when the update sets `status: 'cancelled'`
  and the row has `googleEventId` and a `userId` — best-effort delete the
  event with the owner's token (the BOOKER's userId, not the caller's),
  then clear `googleEventId`.

## Rollout note (PR body)

Deploy order is unconstrained (additive migration, applied pre-merge).
After deploy, **each user signs out and back in once** to grant the
calendar scope; until then their bookings simply don't sync.

## Testing

- Unit: `addMinutesLocal` (hour/day/month rollover, seconds-less input).
- `lib/google-calendar.ts` network calls: not unit-testable here (external
  API, no harness — issue #16); typed thin, verified by smoke after deploy.
- Gates: tsc, suite, build. Smoke: book → event appears in Google Calendar
  at the right local time; cancel → event disappears.

## Out of scope

Reschedule sync (no reschedule feature), two-way sync, shared team
calendar, "reconnect Google" UI nudge, per-team timezones.
