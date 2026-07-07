'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { normalizeTagName } from '@/lib/tags'

export type TagRef = { tagId: string; name: string }

/** Fetches and mutates the tags attached to one house or business.
 * Attach is optimistic (temp chip swapped for the server row);
 * remove is optimistic with revert. All failures set `error`. */
export function useTags(
  endpoint: 'house-tags' | 'business-tags',
  entityKey: 'houseId' | 'businessId',
  entityId: string | null,
) {
  const [tags, setTags] = useState<TagRef[]>([])
  const [error, setError] = useState<string | null>(null)

  const entityRef = useRef(entityId)
  useEffect(() => { entityRef.current = entityId }, [entityId])

  useEffect(() => {
    setTags([])
    setError(null)
    if (!entityId) return
    const controller = new AbortController()
    fetch(`/api/${endpoint}?${entityKey}=${entityId}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('load failed')))
      .then(setTags)
      .catch(e => { if ((e as Error)?.name !== 'AbortError') setError('Failed to load tags.') })
    return () => controller.abort()
  }, [endpoint, entityKey, entityId])

  const attach = useCallback(async (name: string) => {
    if (!entityId) return
    const trimmed = normalizeTagName(name)
    if (!trimmed) return
    if (tags.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) return
    const tempId = `pending:${trimmed}`
    setError(null)
    setTags(prev => [...prev, { tagId: tempId, name: trimmed }])
    try {
      const res = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [entityKey]: entityId, name: trimmed }),
      })
      if (!res.ok) throw new Error('attach failed')
      const saved: TagRef = await res.json()
      if (entityRef.current !== entityId) return
      setTags(prev => {
        if (prev.some(t => t.tagId === saved.tagId)) return prev.filter(t => t.tagId !== tempId)
        return prev.map(t => t.tagId === tempId ? saved : t)
      })
    } catch {
      if (entityRef.current !== entityId) return
      setTags(prev => prev.filter(t => t.tagId !== tempId))
      setError('Failed to add tag. Please try again.')
    }
  }, [endpoint, entityKey, entityId, tags])

  const remove = useCallback(async (tagId: string) => {
    if (!entityId || tagId.startsWith('pending:')) return
    const removed = tags.find(t => t.tagId === tagId)
    if (!removed) return
    setError(null)
    setTags(prev => prev.filter(t => t.tagId !== tagId))
    try {
      const res = await fetch(`/api/${endpoint}?${entityKey}=${entityId}&tagId=${tagId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('remove failed')
    } catch {
      if (entityRef.current !== entityId) return
      setTags(prev => [...prev, removed])
      setError('Failed to remove tag. Please try again.')
    }
  }, [endpoint, entityKey, entityId, tags])

  return { tags, attach, remove, error }
}
