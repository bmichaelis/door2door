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
