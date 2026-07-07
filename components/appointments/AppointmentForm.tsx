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
