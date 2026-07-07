# Appointments with Agenda View — Design

**Issue:** #5 · **Date:** 2026-07-07 · **Status:** Approved (autonomous — user
delegated decisions while offline; review via PR)

Booked appointments as a first-class concept — distinct from the soft
`visits.followUpAt` — with booking from the map panels and an agenda view.
Closes the core of the Lead Scout appointments gap. **Google Calendar sync is
explicitly deferred**: it requires adding the `calendar.events` OAuth scope to
the Google Cloud consent screen, which only the account owner can do. The
schema leaves room for it (a future `calendar_event_id` column is additive).

## Decisions made autonomously (with rationale)

- **One `appointments` table with nullable `house_id`/`business_id` and a
  CHECK that exactly one is set** — deviating from the repo's per-entity
  precedent (`visits`/`business_visits`, `house_notes`/`business_notes`).
  Rationale: appointments' primary read is the cross-entity agenda (one
  time-sorted list) and status updates are id-only; per-entity tables would
  force `?entity=` disambiguation through every API call and a UNION on every
  read. The per-entity precedent wins when operations are entity-scoped;
  here they aren't.
- **`followUpAt` unchanged** — soft "circle back sometime" vs. a hard
  appointment, per the issue's own lean.
- **No VisitForm integration and no agenda→map deep-link in v1** — both are
  real but separable; noted as follow-ups. Booking lives in the panels.
- **Status changes open to all roles** — matches the app's trust model
  (any rep can PATCH any house's status today). No completed/cancelled
  audit trail in v1.
- **No duration field** — Lead Scout books date+time; duration only matters
  for calendar sync, which will add what it needs.

## Data model

Migration `0011_appointments` (journal `when` MUST exceed 0010's
`1783379478257`; use authoring-time epoch).

`appointments`:

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `houseId` | uuid FK → houses, nullable, cascade | |
| `businessId` | uuid FK → businesses, nullable, cascade | |
| `userId` | uuid FK → users, nullable, set null | booking rep |
| `scheduledAt` | timestamp not null | |
| `notes` | text nullable | |
| `status` | text enum `scheduled\|completed\|cancelled\|no_show`, default `scheduled`, not null | |
| `createdAt` | timestamp | |

SQL: `CHECK (("house_id" IS NULL) <> ("business_id" IS NULL))`; indexes on
`scheduled_at` and `user_id`.

## API (flat style, edge runtime, `withErrorHandling` + `requireRole`)

- `GET /api/appointments` — the agenda. Role-scoped: rep → own
  (`user_id = session id`), manager → their team's reps, admin → all.
  Optional `?status=scheduled` filter (default: `scheduled` only).
  Returns rows sorted by `scheduled_at` asc, each joined to its entity:
  `{ id, scheduledAt, notes, status, repName, entity: 'house'|'business',
  label, sublabel, lat, lng }` where house label = `"<number> <street>"`,
  sublabel = `"<city> — <surname ?? 'No household'>"`; business label =
  name, sublabel = city. (lat/lng included for the future map deep-link;
  cheap to select now via ST_X/ST_Y.)
- `POST /api/appointments` — `{ houseId | businessId, scheduledAt, notes? }`;
  exactly one entity id required (400 otherwise); `scheduledAt` required,
  must parse as a date (400); userId from session. 201 with the row.
- `PATCH /api/appointments/[id]` — `{ status }` only; must be one of the
  four enum values (400); 404 unknown. Returns updated row.
- No DELETE — cancelling is a status, keeping history.

## UI

- **`components/appointments/AppointmentForm.tsx`** (shared): datetime-local
  (required) + notes textarea + Save/Cancel; used by both panels.
- **Panels**: "Book Appointment" button in the Actions row of `HousePanel`
  and below Log Visit in `BusinessPanel`; opens the form as a panel sub-view
  (HousePanel's existing `view` state pattern; BusinessPanel's
  detail/log-visit pattern). POSTs, then returns to detail with a brief
  success note. Try/catch with the panels' error banner conventions.
- **`/appointments` page** (server component, edge): fetches the agenda via
  the same SQL the API uses (shared `lib/appointments.ts` query helper so
  page and API can't drift), renders client `AgendaList`:
  - "Overdue" section first (`scheduled` with `scheduledAt < now`), then
    days grouped ascending ("Today", "Tomorrow", else date).
  - Row: time, label, sublabel, notes, rep name (manager/admin only), and
    status action buttons — Complete / No Show / Cancel — each PATCHing
    with optimistic update + revert on failure (try/catch/finally, the
    established pattern).
  - Empty state: 'No upcoming appointments.'
- **Nav**: `Appointments` link for all roles between Map and Dashboard.

## Testing

- Unit: agenda grouping/labeling helper (`groupAgenda(rows, now)` pure
  function — Overdue/Today/Tomorrow/date bucketing, sorted).
- Component: `AppointmentForm` (submit shape, required datetime, cancel);
  `AgendaList` (grouping render, status action calls PATCH callback,
  optimistic behavior via callback contract, empty state).
- Schema tests per convention. Route logic uninspectable per issue #16 —
  thin routes over the tested `lib/appointments.ts` helper.

## Out of scope (follow-ups noted in PR)

- Google Calendar sync (needs user's OAuth consent-screen change).
- VisitForm "book it now" shortcut; agenda→map deep-link.
- Reminders/notifications beyond the agenda view.
