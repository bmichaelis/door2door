'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Trash2Icon } from 'lucide-react'

export type TagRow = { id: string; name: string; createdAt: string; usageCount: string | number }

type Props = { initialTags: TagRow[] }

export function TagsClient({ initialTags }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initialTags)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function refresh() {
    const res = await fetch('/api/tags')
    if (res.ok) setItems(await res.json())
    else setError('Could not reload tags')
    router.refresh()
  }

  async function rename(id: string, name: string): Promise<boolean> {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/tags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? 'Rename failed')
        return false
      }
      await refresh()
      return true
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(t: TagRow) {
    const uses = Number(t.usageCount)
    if (!window.confirm(`Delete "${t.name}"? It is attached to ${uses} propert${uses === 1 ? 'y' : 'ies'}.`)) return
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/tags/${t.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? 'Delete failed')
        return
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tags yet — reps create them from the map panels.</p>
      ) : (
        <ul className="space-y-2">
          {items.map(t => (
            <li key={t.id} className="flex items-center gap-3 border rounded-xl p-3">
              <div className="flex-1 min-w-0">
                <EditableName name={t.name} onSave={name => rename(t.id, name)} />
              </div>
              <Badge variant="secondary">{Number(t.usageCount)} in use</Badge>
              <button
                disabled={busy}
                onClick={() => handleDelete(t)}
                aria-label={`Delete ${t.name}`}
                className="text-muted-foreground hover:text-destructive disabled:opacity-30"
              >
                <Trash2Icon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EditableName({ name: initial, onSave }: { name: string; onSave: (name: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(initial)

  if (!editing) {
    return (
      <button type="button" className="font-medium hover:underline" onClick={() => { setName(initial); setEditing(true) }}>
        {initial}
      </button>
    )
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async e => {
        e.preventDefault()
        if (!name.trim()) return
        const ok = await onSave(name.trim())
        if (ok) setEditing(false)
      }}
    >
      <Input value={name} onChange={e => setName(e.target.value)} className="h-8" autoFocus />
      <Button type="submit" size="sm">Save</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
    </form>
  )
}
