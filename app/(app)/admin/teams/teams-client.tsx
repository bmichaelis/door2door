'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

type Team = {
  id: string
  name: string
  managerId: string | null
  managerName: string | null
}

type Manager = { id: string; name: string | null; email: string }

type Props = {
  initialTeams: Team[]
  managers: Manager[]
}

type Draft = { name: string; managerId: string }

const emptyDraft = (): Draft => ({ name: '', managerId: '' })

export function TeamsClient({ initialTeams, managers }: Props) {
  const [teams, setTeams] = useState(initialTeams)
  const [creating, setCreating] = useState(false)
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft())
  const [editing, setEditing] = useState<Record<string, Draft>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!newDraft.name.trim()) return
    setBusy(prev => ({ ...prev, _new: true }))
    setError(null)
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDraft.name.trim(), managerId: newDraft.managerId || null }),
      })
      if (!res.ok) throw new Error('Failed to create team')
      const created = await res.json()
      const manager = managers.find(m => m.id === created.managerId)
      setTeams(prev => [...prev, {
        id: created.id,
        name: created.name,
        managerId: created.managerId ?? null,
        managerName: manager?.name ?? manager?.email ?? null,
      }].sort((a, b) => a.name.localeCompare(b.name)))
      setNewDraft(emptyDraft())
      setCreating(false)
    } catch {
      setError('Failed to create team. Try again.')
    } finally {
      setBusy(prev => ({ ...prev, _new: false }))
    }
  }

  async function handleSave(id: string) {
    const draft = editing[id]
    if (!draft.name.trim()) return
    setBusy(prev => ({ ...prev, [id]: true }))
    try {
      const res = await fetch(`/api/teams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.name.trim(), managerId: draft.managerId || null }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      const manager = managers.find(m => m.id === updated.managerId)
      setTeams(prev => prev.map(t => t.id !== id ? t : {
        ...t,
        name: updated.name,
        managerId: updated.managerId ?? null,
        managerName: manager?.name ?? manager?.email ?? null,
      }))
      setEditing(prev => { const next = { ...prev }; delete next[id]; return next })
    } catch {
      setError('Failed to save. Try again.')
    } finally {
      setBusy(prev => ({ ...prev, [id]: false }))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this team? Members will be unassigned.')) return
    setBusy(prev => ({ ...prev, [id]: true }))
    try {
      const res = await fetch(`/api/teams/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setTeams(prev => prev.filter(t => t.id !== id))
    } catch {
      setError('Failed to delete. Try again.')
    } finally {
      setBusy(prev => ({ ...prev, [id]: false }))
    }
  }

  function startEdit(team: Team) {
    setEditing(prev => ({
      ...prev,
      [team.id]: { name: team.name, managerId: team.managerId ?? '' },
    }))
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <ul className="space-y-2">
        {teams.map(t => {
          const isEditing = !!editing[t.id]
          const draft = editing[t.id]
          return (
            <li key={t.id} className="border rounded p-3 space-y-2">
              {!isEditing ? (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{t.name}</span>
                    <p className="text-sm text-muted-foreground">
                      {t.managerName ? `Manager: ${t.managerName}` : 'No manager'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => startEdit(t)}>Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(t.id)} disabled={busy[t.id]}>
                      Delete
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="border rounded px-2 py-1 text-sm flex-1 min-w-32"
                    value={draft.name}
                    onChange={e => setEditing(prev => ({ ...prev, [t.id]: { ...prev[t.id], name: e.target.value } }))}
                    placeholder="Team name"
                  />
                  <select
                    className="border rounded px-2 py-1 text-sm"
                    value={draft.managerId}
                    onChange={e => setEditing(prev => ({ ...prev, [t.id]: { ...prev[t.id], managerId: e.target.value } }))}
                  >
                    <option value="">— no manager —</option>
                    {managers.map(m => (
                      <option key={m.id} value={m.id}>{m.name ?? m.email}</option>
                    ))}
                  </select>
                  <Button size="sm" onClick={() => handleSave(t.id)} disabled={busy[t.id]}>
                    {busy[t.id] ? 'Saving…' : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost"
                    onClick={() => setEditing(prev => { const next = { ...prev }; delete next[t.id]; return next })}>
                    Cancel
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {!creating ? (
        <Button onClick={() => setCreating(true)}>New Team</Button>
      ) : (
        <div className="border rounded p-3 space-y-2">
          <p className="text-sm font-medium">New team</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="border rounded px-2 py-1 text-sm flex-1 min-w-32"
              value={newDraft.name}
              onChange={e => setNewDraft(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Team name"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <select
              className="border rounded px-2 py-1 text-sm"
              value={newDraft.managerId}
              onChange={e => setNewDraft(prev => ({ ...prev, managerId: e.target.value }))}
            >
              <option value="">— no manager —</option>
              {managers.map(m => (
                <option key={m.id} value={m.id}>{m.name ?? m.email}</option>
              ))}
            </select>
            <Button size="sm" onClick={handleCreate} disabled={busy._new || !newDraft.name.trim()}>
              {busy._new ? 'Creating…' : 'Create'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewDraft(emptyDraft()) }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
