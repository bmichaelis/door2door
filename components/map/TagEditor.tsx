'use client'
import { useState, useRef, useEffect } from 'react'
import { XIcon, PlusIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { TagRef } from './useTags'

type Suggestion = { id: string; name: string }

type Props = {
  tags: TagRef[]
  onAttach: (name: string) => void
  onRemove: (tagId: string) => void
}

export function TagEditor({ tags, onAttach, onRemove }: Props) {
  const [adding, setAdding] = useState(false)
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const seqRef = useRef(0)
  const tagsRef = useRef(tags)
  useEffect(() => { tagsRef.current = tags }, [tags])
  useEffect(() => () => clearTimeout(debounceRef.current), [])

  function handleInputChange(value: string) {
    setInput(value)
    clearTimeout(debounceRef.current)
    if (!value.trim()) { setSuggestions([]); return }
    debounceRef.current = setTimeout(() => {
      const seq = ++seqRef.current
      fetch(`/api/tags?q=${encodeURIComponent(value.trim())}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then((rows: Suggestion[]) => {
          if (seq !== seqRef.current) return
          setSuggestions(rows.filter(s => !tagsRef.current.some(t => t.tagId === s.id)))
        })
        .catch(() => {})
    }, 250)
  }

  function submit(name: string) {
    if (!name.trim()) return
    onAttach(name.trim())
    setInput('')
    setSuggestions([])
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map(t => (
          <span key={t.tagId} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium">
            {t.name}
            <button
              type="button"
              aria-label={`Remove ${t.name}`}
              onClick={() => onRemove(t.tagId)}
              className="text-muted-foreground hover:text-destructive"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        {!adding && (
          <button
            type="button"
            aria-label="Add tag"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <PlusIcon className="h-3 w-3" />
            Add tag
          </button>
        )}
      </div>
      {adding && (
        <div className="space-y-1.5">
          <Input
            aria-label="New tag"
            value={input}
            autoFocus
            placeholder="Type a tag…"
            onChange={e => handleInputChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); submit(input) }
              if (e.key === 'Escape') { clearTimeout(debounceRef.current); setAdding(false); setInput(''); setSuggestions([]) }
            }}
          />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => submit(s.name)}
                  className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
