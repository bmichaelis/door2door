'use client'
import { useState, useEffect, useCallback } from 'react'

export type NoteRow = {
  id: string
  body: string
  userId: string | null
  createdAt: string
  authorName: string
}

/** Fetches and mutates the note stream for one house or business.
 * Add awaits the server (needs the row id); delete is optimistic with revert. */
export function useNotes(
  endpoint: 'house-notes' | 'business-notes',
  entityKey: 'houseId' | 'businessId',
  entityId: string | null,
) {
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setNotes([])
    setError(null)
    if (!entityId) return
    const controller = new AbortController()
    fetch(`/api/${endpoint}?${entityKey}=${entityId}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setNotes)
      .catch(() => {})
    return () => controller.abort()
  }, [endpoint, entityKey, entityId])

  const add = useCallback(async (body: string) => {
    if (!entityId || !body.trim()) return
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [entityKey]: entityId, body: body.trim() }),
      })
      if (!res.ok) throw new Error('add failed')
      const note: NoteRow = await res.json()
      setNotes(prev => [note, ...prev])
    } catch {
      setError('Failed to add note. Please try again.')
    } finally {
      setBusy(false)
    }
  }, [endpoint, entityKey, entityId])

  const removeNote = useCallback(async (id: string) => {
    const removed = notes.find(n => n.id === id)
    if (!removed) return
    setError(null)
    setNotes(prev => prev.filter(n => n.id !== id))
    try {
      const res = await fetch(`/api/${endpoint}/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
    } catch {
      setNotes(prev => [removed, ...prev])
      setError('Failed to delete note. Please try again.')
    }
  }, [endpoint, notes])

  return { notes, add, removeNote, error, busy }
}
