'use client'
import { useState } from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Stop } from '@/lib/route/geo'

export type RoutePanelProps = {
  stops: Stop[]
  ordered: boolean
  hasStart: boolean
  planning: boolean
  error: string | null
  googleMapsUrl: string | null
  onUseMyLocation: () => void
  onAddressSubmit: (address: string) => void
  onRemoveStop: (id: string) => void
  onPlan: () => void
  onClear: () => void
  onClose: () => void
}

export default function RoutePanel(props: RoutePanelProps) {
  const [address, setAddress] = useState('')
  const canPlan = !props.planning && props.hasStart && props.stops.length >= 2

  return (
    <div className="absolute right-3 top-3 z-10 flex w-72 flex-col gap-3 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Plan a route</h2>
        <button type="button" aria-label="Close" onClick={props.onClose}><XIcon className="h-4 w-4" /></button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Start {props.hasStart ? '· set' : ''}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={props.onUseMyLocation}>Use my location</Button>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (address.trim()) props.onAddressSubmit(address.trim()) }}
        >
          <input
            className="h-8 flex-1 rounded border bg-transparent px-2 text-sm"
            placeholder="or a start address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <Button size="sm" variant="outline" type="submit">Set</Button>
        </form>
      </div>

      <ol className="flex max-h-56 flex-col gap-1 overflow-auto text-sm">
        {props.stops.map((s, i) => (
          <li key={s.id} className="flex items-center justify-between gap-2">
            <span>{props.ordered ? `${i + 1}. ` : '• '}{s.name}</span>
            <button type="button" aria-label={`Remove ${s.name}`} onClick={() => props.onRemoveStop(s.id)}>
              <XIcon className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ol>

      {props.error && <p className="text-xs text-destructive">{props.error}</p>}

      <div className="flex items-center justify-between gap-2">
        <button type="button" className="text-xs text-muted-foreground underline" onClick={props.onClear}>Clear</button>
        <Button size="sm" disabled={!canPlan} onClick={props.onPlan}>
          {props.planning ? 'Planning…' : 'Plan route'}
        </Button>
      </div>

      {props.googleMapsUrl && (
        <a
          className="rounded bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground"
          href={props.googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Google Maps
        </a>
      )}
    </div>
  )
}
