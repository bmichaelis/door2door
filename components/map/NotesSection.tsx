'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Trash2Icon } from 'lucide-react'
import { canDeleteNote } from '@/lib/permissions'
import type { NoteRow } from './useNotes'

type Props = {
  notes: NoteRow[]
  currentUser: { id: string; role: string }
  onAdd: (body: string) => void
  onDelete: (id: string) => void
  busy?: boolean
}

export function NotesSection({ notes, currentUser, onAdd, onDelete, busy }: Props) {
  const [draft, setDraft] = useState('')

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    onAdd(draft.trim())
    setDraft('')
  }

  return (
    <div className="space-y-2">
      <form onSubmit={handleAdd} className="flex items-start gap-2">
        <Textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={1}
          placeholder="Add a note about this property…"
          className="flex-1"
        />
        <Button type="submit" disabled={busy || !draft.trim()}>Add</Button>
      </form>
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map(n => (
            <li key={n.id} className="flex items-start gap-3 rounded-xl border bg-background px-4 py-3 text-sm">
              <div className="flex-1 space-y-0.5">
                <p>{n.body}</p>
                <p className="text-xs text-muted-foreground">
                  {n.authorName} · {new Date(n.createdAt).toLocaleDateString()}
                </p>
              </div>
              {canDeleteNote(currentUser, n) && (
                <button
                  type="button"
                  aria-label={`Delete note by ${n.authorName}`}
                  onClick={() => onDelete(n.id)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2Icon className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
