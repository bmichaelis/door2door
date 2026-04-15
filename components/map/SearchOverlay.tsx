'use client'
import { useState, useEffect, useRef } from 'react'
import { SearchIcon, XIcon, HomeIcon, BuildingIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HouseWithOutcome } from '@/lib/houses'
import type { BusinessRow } from './BusinessPins'

type SearchResult =
  | { kind: 'house'; item: HouseWithOutcome }
  | { kind: 'business'; item: BusinessRow }

type Props = {
  open: boolean
  houses: HouseWithOutcome[]
  businesses: BusinessRow[]
  onClose: () => void
  onSelect: (result: SearchResult) => void
}

function houseAddress(h: HouseWithOutcome) {
  return [h.number, h.street].filter(Boolean).join(' ')
}

function search(query: string, houses: HouseWithOutcome[], businesses: BusinessRow[]): SearchResult[] {
  if (!query.trim()) return []
  const q = query.toLowerCase()

  const matchedHouses: SearchResult[] = houses
    .filter(h => houseAddress(h).toLowerCase().includes(q) || h.street?.toLowerCase().includes(q))
    .slice(0, 5)
    .map(item => ({ kind: 'house', item }))

  const matchedBusinesses: SearchResult[] = businesses
    .filter(b =>
      b.name.toLowerCase().includes(q) ||
      (b.street ?? '').toLowerCase().includes(q) ||
      [b.number, b.street].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
    .slice(0, 5)
    .map(item => ({ kind: 'business', item }))

  return [...matchedHouses, ...matchedBusinesses]
}

export function SearchOverlay({ open, houses, businesses, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const results = search(query, houses, businesses)

  const houseResults = results.filter(r => r.kind === 'house') as { kind: 'house'; item: HouseWithOutcome }[]
  const bizResults = results.filter(r => r.kind === 'business') as { kind: 'business'; item: BusinessRow }[]

  useEffect(() => {
    if (open) {
      setQuery('')
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
            placeholder="Search address or business name…"
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
              Type an address or business name
            </p>
          )}

          {query.trim() && results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results for "{query}"
            </p>
          )}

          {houseResults.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Homes
              </p>
              {houseResults.map(r => (
                <button
                  key={r.item.id}
                  onClick={() => handleSelect(r)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 text-left transition-colors"
                >
                  <HomeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{houseAddress(r.item)}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.item.city}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {bizResults.length > 0 && (
            <div className={cn(houseResults.length > 0 && 'border-t')}>
              <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Businesses
              </p>
              {bizResults.map(r => (
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
