'use client'
import { useState, useEffect } from 'react'

export type UserRow = { id: string; name: string | null; role: string | null; teamId: string | null }

type NeighborhoodRow = {
  id: string
  name: string
  teamId: string | null
  team_id?: string | null
  houseCount: number
  assignedUserId: string | null
  territoryStatus: string | null
}

const STATUS_OPTIONS = [
  { value: '', label: '—' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
]

export function repOptionsFor(
  neighborhood: { teamId: string | null },
  users: UserRow[],
  role: string,
): UserRow[] {
  const reps = users.filter(u => u.role === 'rep')
  if (role === 'admin') return reps
  return reps.filter(u => u.teamId === neighborhood.teamId)
}

type Props = {
  currentUser: { id: string; role: string; teamId: string | null }
}

export function TerritoriesClient({ currentUser }: Props) {
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodRow[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/neighborhoods?includeEmpty=1').then(r => r.ok ? r.json() : Promise.reject(new Error('load failed'))),
      fetch('/api/users').then(r => r.ok ? r.json() : Promise.reject(new Error('load failed'))),
    ])
      .then(([nbhds, us]: [NeighborhoodRow[], UserRow[]]) => {
        // GET /api/neighborhoods returns team_id (snake_case); normalize once
        setNeighborhoods(nbhds.map(n => ({ ...n, teamId: n.teamId ?? n.team_id ?? null })))
        setUsers(us)
      })
      .catch(() => setError('Failed to load territories.'))
      .finally(() => setLoading(false))
  }, [])

  const visible = currentUser.role === 'manager'
    ? neighborhoods.filter(n => n.teamId === currentUser.teamId)
    : neighborhoods

  async function patch(n: NeighborhoodRow, field: 'assignedUserId' | 'territoryStatus', value: string | null) {
    setError(null)
    setBusyId(n.id)
    try {
      const res = await fetch(`/api/neighborhoods/${n.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Update failed')
      }
      setNeighborhoods(prev => prev.map(row => {
        if (row.id !== n.id) return row
        const next = { ...row, [field]: value }
        return next
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No neighborhoods yet.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map(n => (
            <li key={n.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{n.name}</p>
                <p className="text-xs text-muted-foreground">{n.houseCount} homes</p>
              </div>
              <select
                aria-label={`Assignee for ${n.name}`}
                disabled={busyId === n.id}
                value={n.assignedUserId ?? ''}
                onChange={e => patch(n, 'assignedUserId', e.target.value || null)}
                className="rounded-lg border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">Unassigned</option>
                {repOptionsFor(n, users, currentUser.role).map(u => (
                  <option key={u.id} value={u.id}>{u.name ?? 'Unknown'}</option>
                ))}
              </select>
              <select
                aria-label={`Status for ${n.name}`}
                disabled={busyId === n.id}
                value={n.territoryStatus ?? ''}
                onChange={e => patch(n, 'territoryStatus', e.target.value || null)}
                className="rounded-lg border bg-background px-2 py-1.5 text-sm"
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
