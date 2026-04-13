'use client'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type User = {
  id: string
  name: string | null
  email: string
  role: string | null
  teamName: string | null
  teamId: string | null
}

type Team = { id: string; name: string }

type Props = {
  initialUsers: User[]
  teams: Team[]
}

export function UserList({ initialUsers, teams }: Props) {
  const [users, setUsers] = useState(initialUsers)
  const [editing, setEditing] = useState<Record<string, { role: string; teamId: string }>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  function startEdit(user: User) {
    setEditing(prev => ({
      ...prev,
      [user.id]: { role: user.role ?? '', teamId: user.teamId ?? '' },
    }))
  }

  function cancelEdit(id: string) {
    setEditing(prev => { const next = { ...prev }; delete next[id]; return next })
    setErrors(prev => { const next = { ...prev }; delete next[id]; return next })
  }

  async function saveEdit(id: string) {
    const { role, teamId } = editing[id]
    setSaving(prev => ({ ...prev, [id]: true }))
    setErrors(prev => { const next = { ...prev }; delete next[id]; return next })
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: role || null, teamId: teamId || null }),
      })
      if (!res.ok) throw new Error('Failed to save')
      const updated = await res.json()
      setUsers(prev => prev.map(u => u.id !== id ? u : {
        ...u,
        role: updated.role ?? null,
        teamId: updated.teamId ?? null,
        teamName: teams.find(t => t.id === updated.teamId)?.name ?? null,
      }))
      cancelEdit(id)
    } catch {
      setErrors(prev => ({ ...prev, [id]: 'Save failed. Try again.' }))
    } finally {
      setSaving(prev => ({ ...prev, [id]: false }))
    }
  }

  return (
    <ul className="space-y-2">
      {users.map(u => {
        const isEditing = !!editing[u.id]
        const draft = editing[u.id]
        return (
          <li key={u.id} className="border rounded p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{u.name ?? u.email}</span>
                <p className="text-sm text-muted-foreground">{u.email}</p>
              </div>
              {!isEditing && (
                <div className="flex items-center gap-2">
                  <Badge variant={u.role ? 'outline' : 'secondary'}>{u.role ?? 'pending'}</Badge>
                  <span className="text-sm text-muted-foreground">{u.teamName ?? '—'}</span>
                  <Button size="sm" variant="outline" onClick={() => startEdit(u)}>Edit</Button>
                </div>
              )}
            </div>
            {isEditing && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="border rounded px-2 py-1 text-sm"
                  value={draft.role}
                  onChange={e => setEditing(prev => ({ ...prev, [u.id]: { ...prev[u.id], role: e.target.value } }))}
                >
                  <option value="">— no role —</option>
                  <option value="admin">admin</option>
                  <option value="manager">manager</option>
                  <option value="rep">rep</option>
                </select>
                <select
                  className="border rounded px-2 py-1 text-sm"
                  value={draft.teamId}
                  onChange={e => setEditing(prev => ({ ...prev, [u.id]: { ...prev[u.id], teamId: e.target.value } }))}
                >
                  <option value="">— no team —</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <Button size="sm" onClick={() => saveEdit(u.id)} disabled={saving[u.id]}>
                  {saving[u.id] ? 'Saving…' : 'Save'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => cancelEdit(u.id)} disabled={saving[u.id]}>
                  Cancel
                </Button>
                {errors[u.id] && <p className="text-sm text-destructive">{errors[u.id]}</p>}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
