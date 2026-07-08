'use client'
import { useState, useEffect, useRef } from 'react'
import { SearchIcon, XIcon, HomeIcon, BuildingIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HouseRow } from '@/lib/db/schema'
import type { BusinessRow } from './BusinessPins'

type HouseSearchResult = HouseRow & { surname?: string | null; headOfHouseholdName?: string | null; spouseName?: string | null }

type SearchResult =
  | { kind: 'house'; item: HouseSearchResult }
  | { kind: 'business'; item: BusinessRow }

type Props = {
  open: boolean
  onClose: () => void
  onSelect: (result: SearchResult) => void
}

export function SearchOverlay({ open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [houseResults, setHouseResults] = useState<HouseSearchResult[]>([])
  const [bizResults, setBizResults] = useState<BusinessRow[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)
  const housesAbortRef = useRef<AbortController | null>(null)
  const bizAbortRef = useRef<AbortController | null>(null)

  // Server-side search: houses (address or surname) + businesses (name or address) in parallel
  useEffect(() => {
    clearTimeout(searchTimeout.current)
    housesAbortRef.current?.abort()
    bizAbortRef.current?.abort()
    if (query.trim().length < 2) { setHouseResults([]); setBizResults([]); setSearching(false); return }
    setSearching(true)
    searchTimeout.current = setTimeout(() => {
      const housesController = new AbortController()
      const bizController = new AbortController()
      housesAbortRef.current = housesController
      bizAbortRef.current = bizController
      const q = encodeURIComponent(query.trim())
      const houses = fetch(`/api/houses/search?q=${q}`, { signal: housesController.signal })
        .then(r => r.json())
        .then((rows: HouseSearchResult[]) => setHouseResults(rows))
        .catch(e => { if (e.name !== 'AbortError') setHouseResults([]) })
      const biz = fetch(`/api/businesses/search?q=${q}`, { signal: bizController.signal })
        .then(r => r.json())
        .then((rows: BusinessRow[]) => setBizResults(rows))
        .catch(e => { if (e.name !== 'AbortError') setBizResults([]) })
      Promise.all([houses, biz]).finally(() => setSearching(false))
    }, 400)
  }, [query])

  const bizResultsForDisplay = bizResults.map(item => ({ kind: 'business' as const, item }))

  useEffect(() => {
    if (open) {
      setQuery('')
      setHouseResults([])
      setBizResults([])
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function handleSelect(result: SearchResult) {
    onSelect(result)
    onClose()
  }

  const houseResultsForDisplay = houseResults.map(item => ({ kind: 'house' as const, item }))

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center pt-16 px-4 bg-black/40 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg rounded-2xl border bg-background shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search address or household surname…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!query.trim() && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Type an address or household surname
            </p>
          )}

          {query.trim() && searching && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Searching…</p>
          )}

          {query.trim() && !searching && houseResultsForDisplay.length === 0 && bizResults.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results for &quot;{query}&quot;
            </p>
          )}

          {houseResultsForDisplay.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Homes
              </p>
              {houseResultsForDisplay.map(r => (
                <button
                  key={r.item.id}
                  onClick={() => handleSelect(r)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 text-left transition-colors"
                >
                  <HomeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.item.number} {r.item.street}</p>
                    {r.item.surname
                      ? <p className="text-xs text-muted-foreground truncate">
                          {[
                            r.item.headOfHouseholdName && r.item.spouseName
                              ? `${r.item.headOfHouseholdName} or ${r.item.spouseName}`
                              : r.item.headOfHouseholdName,
                            r.item.surname,
                          ].filter(Boolean).join(' ')} · {r.item.city}
                        </p>
                      : <p className="text-xs text-muted-foreground truncate">{r.item.city}</p>
                    }
                  </div>
                </button>
              ))}
            </div>
          )}

          {bizResultsForDisplay.length > 0 && (
            <div className={cn(houseResultsForDisplay.length > 0 && 'border-t')}>
              <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Businesses
              </p>
              {bizResultsForDisplay.map(r => (
                <button
                  key={r.item.id}
                  onClick={() => handleSelect(r)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 text-left transition-colors"
                >
                  <BuildingIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.item.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[r.item.number, r.item.street].filter(Boolean).join(' ') || r.item.city || r.item.category}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
