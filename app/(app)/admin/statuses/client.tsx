'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Status } from '@/lib/db/schema'
import { ChevronUpIcon, ChevronDownIcon, Trash2Icon } from 'lucide-react'

const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#94a3b8', '#78716c',
]

const AUTO_LABEL: Record<string, string> = {
  not_home: 'Not Home',
  interested: 'Interested',
  callback: 'Follow Up',
  customer: 'Sold',
  not_interested: 'Refused / Not Interested',
}

type Props = { initialStatuses: Status[] }

export function StatusesClient({ initialStatuses }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initialStatuses)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PALETTE[5])
  const [busy, setBusy] = useState(false)

  async function refresh() {
    const res = await fetch('/api/statuses')
    if (res.ok) setItems(await res.json())
    router.refresh()
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null)
    setBusy(true)
    const res = await fetch(`/api/statuses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? 'Update failed')
      return false
    }
    await refresh()
    return true
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setError(null)
    setBusy(true)
    const res = await fetch('/api/statuses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    })
    setBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? 'Create failed')
      return
    }
    setNewName('')
    await refresh()
  }

  async function handleDelete(s: Status) {
    if (!window.confirm(`Delete "${s.name}"? Houses with this status will lose it.`)) return
    setError(null)
    setBusy(true)
    const res = await fetch(`/api/statuses/${s.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? 'Delete failed')
      return
    }
    await refresh()
  }

  async function move(index: number, dir: -1 | 1) {
    const a = items[index]
    const b = items[index + dir]
    if (!a || !b) return
    // Swap sort orders via two PATCHes; refresh re-sorts
    const ok = await patch(a.id, { sortOrder: b.sortOrder })
    if (ok) await patch(b.id, { sortOrder: a.sortOrder })
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      <ul className="space-y-2">
        {items.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 border rounded-xl p-3">
            <span className="h-5 w-5 shrink-0 rounded-full border" style={{ backgroundColor: s.color }} />
            <div className="flex-1 min-w-0">
              <EditableName status={s} onSave={name => patch(s.id, { name })} />
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {PALETTE.map(c => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Set color ${c}`}
                    onClick={() => patch(s.id, { color: c })}
                    className={cn('h-4 w-4 rounded-full border', s.color === c && 'ring-2 ring-offset-1 ring-primary')}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            {s.autoKey && <Badge variant="secondary">auto: {AUTO_LABEL[s.autoKey] ?? s.autoKey}</Badge>}
            {!s.autoKey && (
              <Badge
                variant={s.active ? 'default' : 'secondary'}
                className="cursor-pointer"
                onClick={() => patch(s.id, { active: !s.active })}
              >
                {s.active ? 'Active' : 'Inactive'}
              </Badge>
            )}
            <div className="flex flex-col">
              <button disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Move up"
                className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                <ChevronUpIcon className="h-4 w-4" />
              </button>
              <button disabled={busy || i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down"
                className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                <ChevronDownIcon className="h-4 w-4" />
              </button>
            </div>
            {!s.autoKey && (
              <button disabled={busy} onClick={() => handleDelete(s)} aria-label={`Delete ${s.name}`}
                className="text-muted-foreground hover:text-destructive disabled:opacity-30">
                <Trash2Icon className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={handleAdd} className="flex items-center gap-2 border rounded-xl p-3">
        <Input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New status name…"
          className="flex-1"
        />
        <div className="flex items-center gap-1">
          {PALETTE.map(c => (
            <button
              key={c}
              type="button"
              aria-label={`Choose color ${c}`}
              onClick={() => setNewColor(c)}
              className={cn('h-5 w-5 rounded-full border', newColor === c && 'ring-2 ring-offset-1 ring-primary')}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <Button type="submit" disabled={busy || !newName.trim()}>Add</Button>
      </form>
    </div>
  )
}

function EditableName({ status, onSave }: { status: Status; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(status.name)

  if (!editing) {
    return (
      <button type="button" className="font-medium hover:underline" onClick={() => { setName(status.name); setEditing(true) }}>
        {status.name}
      </button>
    )
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={e => { e.preventDefault(); if (name.trim()) { onSave(name.trim()); setEditing(false) } }}
    >
      <Input value={name} onChange={e => setName(e.target.value)} className="h-8" autoFocus />
      <Button type="submit" size="sm">Save</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
    </form>
  )
}
