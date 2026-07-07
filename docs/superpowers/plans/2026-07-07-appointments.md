# Appointments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First-class appointments (book from map panels, agenda view at `/appointments` with status actions), distinct from the soft `followUpAt`. Google Calendar sync deferred (needs user's OAuth consent change).

**Architecture:** One `appointments` table (nullable `house_id`/`business_id`, CHECK exactly-one — deliberate deviation from per-entity precedent because the agenda read is cross-entity and status PATCHes are id-only). Shared `lib/appointments.ts` holds the agenda SQL (used by page and API) and a pure `groupAgenda` bucketing helper. Flat API routes; booking sub-views in both panels; server-rendered agenda page with a client list.

**Tech Stack:** Next.js 15 App Router edge on Cloudflare Pages, Neon + drizzle sql templates, React 19, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-07-appointments-design.md`

## Global Constraints

- Code style: no semicolons, single quotes, 2-space indent.
- Migration journal entry `when` MUST be `1783412325067` (exceeds 0010's `1783379478257`; issue #14 convention).
- Status enum exactly: `scheduled | completed | cancelled | no_show`. Agenda shows `scheduled` only; Overdue = scheduled with `scheduledAt < now`. Empty state exactly `No upcoming appointments.`
- Role scoping: rep → own appointments, manager → their team's, admin → all.
- Gates: `npx tsc --noEmit`, `npm run test:run` (single `lib/auth.test.ts` env-only failure expected — fails on main too), `next build` with dummy env. Do NOT run `npm run lint` (broken on main, issue #15).
- Commit per task, subjects reference `#5`.
- Worktree has no node_modules; migration apply uses the main repo binary: `cp /home/ubuntu/repos/door2door/.env.local .env.local` then `node --env-file=.env.local /home/ubuntu/repos/door2door/node_modules/.bin/drizzle-kit migrate`.

---

### Task 1: Schema + migration 0011

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/schema.test.ts`
- Create: `lib/db/migrations/0011_appointments.sql`
- Modify: `lib/db/migrations/meta/_journal.json`

**Interfaces:**
- Produces: `appointments` Drizzle table + `type Appointment` from `@/lib/db/schema`.

- [ ] **Step 1: Failing tests** — add `appointments` to the schema.test.ts import from `./schema` and append inside the describe block:

```ts
  it('appointments table has required columns', () => {
    expect((appointments.houseId as { name: string }).name).toBe('house_id')
    expect((appointments.businessId as { name: string }).name).toBe('business_id')
    expect((appointments.userId as { name: string }).name).toBe('user_id')
    expect((appointments.scheduledAt as { name: string }).name).toBe('scheduled_at')
    expect(appointments.status).toBeDefined()
    expect(appointments.notes).toBeDefined()
  })
```

- [ ] **Step 2: Verify RED** — Run: `npm run test:run -- lib/db/schema.test.ts` — Expected: FAIL (`appointments` not exported).

- [ ] **Step 3: Implement** — in `lib/db/schema.ts` insert after the `businessNotes` table:

```ts
export const appointments = pgTable('appointments', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Exactly one of houseId/businessId is set — enforced by a CHECK in the migration
  houseId: uuid('house_id').references(() => houses.id, { onDelete: 'cascade' }),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  scheduledAt: timestamp('scheduled_at').notNull(),
  notes: text('notes'),
  status: text('status', { enum: ['scheduled', 'completed', 'cancelled', 'no_show'] }).default('scheduled').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

and add to the type exports: `export type Appointment = typeof appointments.$inferSelect`

- [ ] **Step 4: Verify GREEN** — Run: `npm run test:run -- lib/db/schema.test.ts` — Expected: PASS.

- [ ] **Step 5: Migration** — create `lib/db/migrations/0011_appointments.sql`:

```sql
CREATE TABLE IF NOT EXISTS "appointments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "house_id" uuid REFERENCES "houses"("id") ON DELETE CASCADE,
  "business_id" uuid REFERENCES "businesses"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "scheduled_at" timestamp NOT NULL,
  "notes" text,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "appointments_one_entity" CHECK (("house_id" IS NULL) <> ("business_id" IS NULL))
);

CREATE INDEX IF NOT EXISTS "appointments_scheduled_idx" ON "appointments" ("scheduled_at");
CREATE INDEX IF NOT EXISTS "appointments_user_idx" ON "appointments" ("user_id");
```

- [ ] **Step 6: Journal** — append to `_journal.json` entries after idx 10:

```json
    {
      "idx": 11,
      "version": "7",
      "when": 1783412325067,
      "tag": "0011_appointments",
      "breakpoints": true
    }
```

- [ ] **Step 7: Apply** — `cp /home/ubuntu/repos/door2door/.env.local .env.local 2>/dev/null; node --env-file=.env.local /home/ubuntu/repos/door2door/node_modules/.bin/drizzle-kit migrate` — Expected: success. Skip + note as concern if `.env.local` missing.

- [ ] **Step 8: Commit**

```bash
git add lib/db/schema.ts lib/db/schema.test.ts lib/db/migrations/0011_appointments.sql lib/db/migrations/meta/_journal.json
git commit -m "feat: appointments table with one-entity check and migration (#5)"
```

---

### Task 2: `lib/appointments.ts` — agenda query + `groupAgenda` (TDD)

**Files:**
- Create: `lib/appointments.ts`
- Create: `lib/appointments.test.ts`

**Interfaces:**
- Produces from `@/lib/appointments`:

```ts
export type AgendaRow = {
  id: string
  scheduledAt: string
  notes: string | null
  status: string
  repName: string | null
  entity: 'house' | 'business'
  label: string
  sublabel: string
  lat: number
  lng: number
}
export type AgendaScope = { role: string; userId: string; teamId: string | null }
export async function getAgenda(scope: AgendaScope): Promise<AgendaRow[]>
export type AgendaGroup = { key: string; heading: string; rows: AgendaRow[] }
export function groupAgenda(rows: AgendaRow[], now: Date): AgendaGroup[]
```

`groupAgenda` must not import server code — split matters: put `getAgenda` (server) and `groupAgenda`+types together is FINE here because the page/API import both server-side, but `AgendaList` (client) also imports `groupAgenda` and the types — so the DB import would leak into the client bundle. Therefore: **`lib/appointments.ts` = client-safe (`groupAgenda` + both types only); `lib/appointments-server.ts` = `getAgenda`** (imports db + types from the client file). Same split as `lib/tags.ts`/`lib/tags-server.ts`.

- [ ] **Step 1: Failing tests** — create `lib/appointments.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { groupAgenda, type AgendaRow } from './appointments'

const NOW = new Date('2026-07-07T12:00:00')

const row = (over: Partial<AgendaRow>): AgendaRow => ({
  id: 'x',
  scheduledAt: '2026-07-07T15:00:00',
  notes: null,
  status: 'scheduled',
  repName: null,
  entity: 'house',
  label: '123 Main St',
  sublabel: 'Provo — Smith',
  lat: 0,
  lng: 0,
  ...over,
})

describe('groupAgenda', () => {
  it('splits overdue (before now) into a leading Overdue group', () => {
    const groups = groupAgenda([
      row({ id: 'a', scheduledAt: '2026-07-07T09:00:00' }),
      row({ id: 'b', scheduledAt: '2026-07-07T15:00:00' }),
    ], NOW)
    expect(groups[0].heading).toBe('Overdue')
    expect(groups[0].rows.map(r => r.id)).toEqual(['a'])
    expect(groups[1].heading).toBe('Today')
    expect(groups[1].rows.map(r => r.id)).toEqual(['b'])
  })

  it('labels today, tomorrow, and later dates', () => {
    const groups = groupAgenda([
      row({ id: 'a', scheduledAt: '2026-07-07T15:00:00' }),
      row({ id: 'b', scheduledAt: '2026-07-08T09:00:00' }),
      row({ id: 'c', scheduledAt: '2026-07-10T09:00:00' }),
    ], NOW)
    expect(groups.map(g => g.heading)).toEqual(['Today', 'Tomorrow', 'Fri, Jul 10'])
  })

  it('sorts rows by time inside each group and groups ascending', () => {
    const groups = groupAgenda([
      row({ id: 'late', scheduledAt: '2026-07-08T16:00:00' }),
      row({ id: 'early', scheduledAt: '2026-07-08T08:00:00' }),
    ], NOW)
    expect(groups[0].rows.map(r => r.id)).toEqual(['early', 'late'])
  })

  it('omits the Overdue group when nothing is overdue', () => {
    const groups = groupAgenda([row({ scheduledAt: '2026-07-07T15:00:00' })], NOW)
    expect(groups[0].heading).toBe('Today')
  })

  it('returns empty array for no rows', () => {
    expect(groupAgenda([], NOW)).toEqual([])
  })
})
```

- [ ] **Step 2: RED** — Run: `npm run test:run -- lib/appointments.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/appointments.ts`** (client-safe):

```ts
// Client-safe agenda helpers — must never import server-only code (db, auth)

export type AgendaRow = {
  id: string
  scheduledAt: string
  notes: string | null
  status: string
  repName: string | null
  entity: 'house' | 'business'
  label: string
  sublabel: string
  lat: number
  lng: number
}

export type AgendaScope = { role: string; userId: string; teamId: string | null }

export type AgendaGroup = { key: string; heading: string; rows: AgendaRow[] }

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/** Bucket scheduled rows into Overdue (before now), then ascending days
 * labeled Today / Tomorrow / short date. Rows sorted by time throughout. */
export function groupAgenda(rows: AgendaRow[], now: Date): AgendaGroup[] {
  const sorted = [...rows].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  )
  const overdue: AgendaRow[] = []
  const days = new Map<string, { date: Date; rows: AgendaRow[] }>()
  for (const r of sorted) {
    const t = new Date(r.scheduledAt)
    if (t.getTime() < now.getTime()) {
      overdue.push(r)
      continue
    }
    const key = dayKey(t)
    if (!days.has(key)) days.set(key, { date: t, rows: [] })
    days.get(key)!.rows.push(r)
  }
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const groups: AgendaGroup[] = []
  if (overdue.length > 0) groups.push({ key: 'overdue', heading: 'Overdue', rows: overdue })
  for (const [key, { date, rows: dayRows }] of days) {
    const heading =
      key === dayKey(now) ? 'Today' :
      key === dayKey(tomorrow) ? 'Tomorrow' :
      date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    groups.push({ key, heading, rows: dayRows })
  }
  return groups
}
```

- [ ] **Step 4: Implement `lib/appointments-server.ts`**:

```ts
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import type { AgendaRow, AgendaScope } from './appointments'

/** Scheduled appointments joined to their entity, role-scoped, time-ascending.
 * Shared by the /appointments page and GET /api/appointments so they can't drift. */
export async function getAgenda(scope: AgendaScope): Promise<AgendaRow[]> {
  const repFilter =
    scope.role === 'rep' ? sql`AND a.user_id = ${scope.userId}` :
    scope.role === 'manager' && scope.teamId ? sql`AND u.team_id = ${scope.teamId}` :
    sql``
  const rows = await db.execute(sql`
    SELECT
      a.id,
      a.scheduled_at AS "scheduledAt",
      a.notes,
      a.status,
      u.name AS "repName",
      CASE WHEN a.house_id IS NOT NULL THEN 'house' ELSE 'business' END AS entity,
      CASE WHEN a.house_id IS NOT NULL THEN h.number || ' ' || h.street ELSE b.name END AS label,
      CASE WHEN a.house_id IS NOT NULL THEN h.city || ' — ' || COALESCE(ho.surname, 'No household')
           ELSE COALESCE(b.city, '') END AS sublabel,
      CASE WHEN a.house_id IS NOT NULL THEN ST_Y(h.location) ELSE ST_Y(b.location) END AS lat,
      CASE WHEN a.house_id IS NOT NULL THEN ST_X(h.location) ELSE ST_X(b.location) END AS lng
    FROM appointments a
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN houses h ON h.id = a.house_id
    LEFT JOIN businesses b ON b.id = a.business_id
    LEFT JOIN LATERAL (
      SELECT surname FROM households ho2
      WHERE ho2.house_id = a.house_id AND ho2.active = true LIMIT 1
    ) ho ON true
    WHERE a.status = 'scheduled' ${repFilter}
    ORDER BY a.scheduled_at ASC
  `)
  return rows.rows as AgendaRow[]
}
```

- [ ] **Step 5: GREEN** — Run: `npm run test:run -- lib/appointments.test.ts` — Expected: PASS (5 tests). Then `npx tsc --noEmit` — clean.

- [ ] **Step 6: Commit**

```bash
git add lib/appointments.ts lib/appointments.test.ts lib/appointments-server.ts
git commit -m "feat: agenda query and grouping helpers for appointments (#5)"
```

---

### Task 3: API routes — `/api/appointments` + `/api/appointments/[id]`

**Files:**
- Create: `app/api/appointments/route.ts`
- Create: `app/api/appointments/[id]/route.ts`

**Interfaces:**
- Consumes: `appointments` table (Task 1), `getAgenda` (Task 2).
- Produces: `GET /api/appointments` → AgendaRow[]; `POST {houseId?|businessId?, scheduledAt, notes?}` → 201; `PATCH /[id] {status}` → row / 404 / 400.

- [ ] **Step 1: Create `app/api/appointments/route.ts`**:

```ts
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
```

- [ ] **Step 2: Create `app/api/appointments/[id]/route.ts`**:

```ts
export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { appointments } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { eq } from 'drizzle-orm'

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
  return NextResponse.json(appointment)
})
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit && npm run test:run` — clean / pass (env-only failure aside).

- [ ] **Step 4: Commit**

```bash
git add app/api/appointments
git commit -m "feat: appointments API with role-scoped agenda (#5)"
```

---

### Task 4: `AppointmentForm` (TDD) + booking in both panels

**Files:**
- Create: `components/appointments/AppointmentForm.tsx`
- Create: `components/appointments/AppointmentForm.test.tsx`
- Modify: `components/map/HousePanel.tsx`
- Modify: `components/map/BusinessPanel.tsx`

**Interfaces:**
- Produces: `AppointmentForm` props `{ onSubmit: (data: { scheduledAt: string; notes?: string }) => Promise<void>; onCancel: () => void }`.

- [ ] **Step 1: Failing tests** — create `components/appointments/AppointmentForm.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { AppointmentForm } from './AppointmentForm'

describe('AppointmentForm', () => {
  it('submits scheduledAt and trimmed notes', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<AppointmentForm onSubmit={onSubmit} onCancel={vi.fn()} />)
    await user.type(screen.getByLabelText('Date and time'), '2026-07-10T14:30')
    await user.type(screen.getByLabelText('Notes'), '  bring ladder  ')
    await user.click(screen.getByRole('button', { name: 'Book' }))
    expect(onSubmit).toHaveBeenCalledWith({ scheduledAt: '2026-07-10T14:30', notes: 'bring ladder' })
  })

  it('omits notes when blank', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<AppointmentForm onSubmit={onSubmit} onCancel={vi.fn()} />)
    await user.type(screen.getByLabelText('Date and time'), '2026-07-10T14:30')
    await user.click(screen.getByRole('button', { name: 'Book' }))
    expect(onSubmit).toHaveBeenCalledWith({ scheduledAt: '2026-07-10T14:30', notes: undefined })
  })

  it('Book is disabled until a date-time is entered', async () => {
    const user = userEvent.setup()
    render(<AppointmentForm onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Book' })).toBeDisabled()
    await user.type(screen.getByLabelText('Date and time'), '2026-07-10T14:30')
    expect(screen.getByRole('button', { name: 'Book' })).toBeEnabled()
  })

  it('Cancel fires onCancel', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<AppointmentForm onSubmit={vi.fn()} onCancel={onCancel} />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: RED** — `npm run test:run -- components/appointments/AppointmentForm.test.tsx` — FAIL (module not found).

- [ ] **Step 3: Implement `components/appointments/AppointmentForm.tsx`**:

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

type Props = {
  onSubmit: (data: { scheduledAt: string; notes?: string }) => Promise<void>
  onCancel: () => void
}

export function AppointmentForm({ onSubmit, onCancel }: Props) {
  const [scheduledAt, setScheduledAt] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!scheduledAt) return
    setSaving(true)
    try {
      await onSubmit({ scheduledAt, notes: notes.trim() || undefined })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="appointment-when" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date and time</Label>
        <Input id="appointment-when" aria-label="Date and time" type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="appointment-notes" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</Label>
        <Textarea id="appointment-notes" aria-label="Notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes…" />
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={saving || !scheduledAt} className="flex-1">
          {saving ? 'Booking…' : 'Book'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: GREEN** — `npm run test:run -- components/appointments/AppointmentForm.test.tsx` — PASS (4 tests).

- [ ] **Step 5: HousePanel integration** (`components/map/HousePanel.tsx`):

1. `import { AppointmentForm } from '@/components/appointments/AppointmentForm'`
2. Extend the View union: `type View = 'detail' | 'log-visit' | 'new-household' | 'book-appointment'`
3. Extend `viewTitle`: add `view === 'book-appointment' ? 'Book Appointment' :` before the `null`.
4. Add a handler near the other handlers:

```tsx
  async function handleBookAppointment(data: { scheduledAt: string; notes?: string }) {
    if (!house) return
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ houseId: house.id, ...data }),
      })
      if (!res.ok) throw new Error('booking failed')
      setView('detail')
    } catch {
      setError('Failed to book appointment. Please try again.')
    }
  }
```

5. In the Actions block, add after the "New Family Moved In" button:

```tsx
                <Button variant="outline" onClick={() => setView('book-appointment')}>
                  Book Appointment
                </Button>
```

6. Add the sub-view render alongside the other non-detail views:

```tsx
          {view === 'book-appointment' && house && (
            <AppointmentForm
              onSubmit={handleBookAppointment}
              onCancel={() => setView('detail')}
            />
          )}
```

- [ ] **Step 6: BusinessPanel integration** (`components/map/BusinessPanel.tsx`):

1. Same import.
2. Widen the view state: `useState<'detail' | 'log-visit' | 'book-appointment'>('detail')`
3. Add handler (uses the existing `statusError` surface? No — add its own): add state `const [bookError, setBookError] = useState<string | null>(null)` and handler:

```tsx
  async function handleBookAppointment(data: { scheduledAt: string; notes?: string }) {
    if (!business) return
    setBookError(null)
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: business.id, ...data }),
      })
      if (!res.ok) throw new Error('booking failed')
      setView('detail')
    } catch {
      setBookError('Failed to book appointment. Please try again.')
    }
  }
```

Also reset it in the entity-switch effect: add `setBookError(null)` next to the existing `setStatusError(null)`.

4. Add a "Book Appointment" button directly under the Log Visit button in the detail view:

```tsx
              <Button variant="outline" className="w-full" onClick={() => setView('book-appointment')}>
                Book Appointment
              </Button>
```

5. Render the sub-view (sibling of the `log-visit` block):

```tsx
          {view === 'book-appointment' && (
            <div className="space-y-3">
              {bookError && <p className="text-sm text-destructive">{bookError}</p>}
              <AppointmentForm onSubmit={handleBookAppointment} onCancel={() => setView('detail')} />
            </div>
          )}
```

- [ ] **Step 7: Verify** — `npx tsc --noEmit && npm run test:run` — clean / pass.

- [ ] **Step 8: Commit**

```bash
git add components/appointments components/map/HousePanel.tsx components/map/BusinessPanel.tsx
git commit -m "feat: book appointments from house and business panels (#5)"
```

---

### Task 5: Agenda page + `AgendaList` (TDD) + nav + gates

**Files:**
- Create: `components/appointments/AgendaList.tsx`
- Create: `components/appointments/AgendaList.test.tsx`
- Create: `app/(app)/appointments/page.tsx`
- Modify: `app/(app)/nav-bar.tsx`

**Interfaces:**
- Consumes: `groupAgenda`/`AgendaRow` (Task 2), `getAgenda` (Task 2), `PATCH /api/appointments/[id]` (Task 3).
- Produces: `AgendaList` props `{ initialRows: AgendaRow[]; showRep: boolean; now?: Date }` (`now` defaults to `new Date()`; injectable for tests).

- [ ] **Step 1: Failing tests** — create `components/appointments/AgendaList.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgendaList } from './AgendaList'
import type { AgendaRow } from '@/lib/appointments'

const NOW = new Date('2026-07-07T12:00:00')

const row = (over: Partial<AgendaRow>): AgendaRow => ({
  id: 'x',
  scheduledAt: '2026-07-07T15:00:00',
  notes: null,
  status: 'scheduled',
  repName: 'Brett',
  entity: 'house',
  label: '123 Main St',
  sublabel: 'Provo — Smith',
  lat: 0,
  lng: 0,
  ...over,
})

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
})
afterEach(() => vi.unstubAllGlobals())

describe('AgendaList', () => {
  it('renders group headings with rows', () => {
    render(<AgendaList initialRows={[
      row({ id: 'a', scheduledAt: '2026-07-07T09:00:00', label: 'Overdue House' }),
      row({ id: 'b', scheduledAt: '2026-07-07T15:00:00', label: 'Today House' }),
    ]} showRep={false} now={NOW} />)
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Overdue House')).toBeInTheDocument()
  })

  it('shows rep name only when showRep', () => {
    const { rerender } = render(<AgendaList initialRows={[row({})]} showRep={false} now={NOW} />)
    expect(screen.queryByText('Brett')).not.toBeInTheDocument()
    rerender(<AgendaList initialRows={[row({})]} showRep now={NOW} />)
    expect(screen.getByText('Brett')).toBeInTheDocument()
  })

  it('completing an appointment PATCHes and removes the row', async () => {
    const user = userEvent.setup()
    render(<AgendaList initialRows={[row({ id: 'a', label: 'Done House' })]} showRep={false} now={NOW} />)
    await user.click(screen.getByRole('button', { name: 'Complete' }))
    expect(fetch).toHaveBeenCalledWith('/api/appointments/a', expect.objectContaining({ method: 'PATCH' }))
    expect(screen.queryByText('Done House')).not.toBeInTheDocument()
  })

  it('restores the row when the PATCH fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    const user = userEvent.setup()
    render(<AgendaList initialRows={[row({ id: 'a', label: 'Sticky House' })]} showRep={false} now={NOW} />)
    await user.click(screen.getByRole('button', { name: 'Cancel appointment' }))
    expect(await screen.findByText('Sticky House')).toBeInTheDocument()
    expect(screen.getByText('Failed to update appointment. Please try again.')).toBeInTheDocument()
  })

  it('shows the empty state', () => {
    render(<AgendaList initialRows={[]} showRep={false} now={NOW} />)
    expect(screen.getByText('No upcoming appointments.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: RED** — `npm run test:run -- components/appointments/AgendaList.test.tsx` — FAIL.

- [ ] **Step 3: Implement `components/appointments/AgendaList.tsx`**:

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { groupAgenda, type AgendaRow } from '@/lib/appointments'

type Props = {
  initialRows: AgendaRow[]
  showRep: boolean
  now?: Date
}

export function AgendaList({ initialRows, showRep, now }: Props) {
  const [rows, setRows] = useState(initialRows)
  const [error, setError] = useState<string | null>(null)

  async function setStatus(id: string, status: 'completed' | 'cancelled' | 'no_show') {
    const removed = rows.find(r => r.id === id)
    if (!removed) return
    setError(null)
    setRows(prev => prev.filter(r => r.id !== id))
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('update failed')
    } catch {
      setRows(prev => [removed, ...prev])
      setError('Failed to update appointment. Please try again.')
    }
  }

  if (rows.length === 0 && !error) {
    return <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
  }

  const groups = groupAgenda(rows, now ?? new Date())

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      {groups.map(g => (
        <div key={g.key}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.heading}</h2>
          <ul className="space-y-2">
            {g.rows.map(r => (
              <li key={r.id} className="rounded-xl border bg-background px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {new Date(r.scheduledAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      {' · '}{r.label}
                    </p>
                    <p className="text-muted-foreground">{r.sublabel}</p>
                    {r.notes && <p className="text-muted-foreground">{r.notes}</p>}
                    {showRep && r.repName && <p className="text-xs text-muted-foreground">{r.repName}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" onClick={() => setStatus(r.id, 'completed')}>Complete</Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus(r.id, 'no_show')}>No Show</Button>
                    <Button size="sm" variant="outline" aria-label="Cancel appointment" onClick={() => setStatus(r.id, 'cancelled')}>Cancel</Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: GREEN** — `npm run test:run -- components/appointments/AgendaList.test.tsx` — PASS (5 tests).

- [ ] **Step 5: Create `app/(app)/appointments/page.tsx`**:

```tsx
export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getAgenda } from '@/lib/appointments-server'
import { AgendaList } from '@/components/appointments/AgendaList'

export default async function AppointmentsPage() {
  const session = await auth()
  if (!session?.user?.role) redirect('/waiting')

  const { role, id: userId, teamId } = session.user
  const rows = await getAgenda({ role, userId, teamId: teamId ?? null })

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Appointments</h1>
      <AgendaList initialRows={rows} showRep={role !== 'rep'} />
    </div>
  )
}
```

- [ ] **Step 6: Nav** — in `app/(app)/nav-bar.tsx` add between the Map and Dashboard links:

```tsx
        {navLink('/appointments', 'Appointments')}
```

- [ ] **Step 7: Full gates** — `npx tsc --noEmit && npm run test:run && AUTH_GOOGLE_ID=dummy AUTH_GOOGLE_SECRET=dummy AUTH_SECRET=dummy DATABASE_URL='postgresql://dummy:dummy@localhost:5432/dummy' npm run build` — clean / pass / build lists `/appointments` and `/api/appointments`.

- [ ] **Step 8: Commit**

```bash
git add components/appointments "app/(app)/appointments" "app/(app)/nav-bar.tsx"
git commit -m "feat: appointments agenda page with status actions and nav (#5)"
```

---

## Self-Review Notes

- **Spec coverage:** table+CHECK+indexes+migration (T1); client/server lib split with the same tags.ts precedent, agenda SQL incl. LATERAL surname and lat/lng for the future deep-link (T2); role-scoped GET, validated POST/PATCH, no DELETE (T3); booking sub-views in both panels with their native view-state patterns (T4); agenda page, grouped list with optimistic status actions + revert, nav, exact empty-state text (T5). Deferred items (calendar sync, VisitForm shortcut, map deep-link) have no tasks by design.
- **Type consistency:** `AgendaRow`/`AgendaScope`/`AgendaGroup` defined once in the client-safe module; server module and components import from it; `now` injectability threaded `groupAgenda(rows, now)` ↔ `AgendaList` prop.
- **Timezone note:** grouping uses local-time day keys (matches how reps think); tests pin `NOW` without a timezone suffix so they evaluate in the runner's local zone consistently with the implementation.
