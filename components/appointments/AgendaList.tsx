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
                      {' · '}<span>{r.label}</span>
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
