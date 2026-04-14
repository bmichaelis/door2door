'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Status = 'idle' | 'fetching' | 'importing' | 'done' | 'error'

type BusinessInput = {
  externalId: string
  name: string
  type: string | null
  category: string | null
  number: string | null
  street: string | null
  city: string | null
  region: string | null
  postcode: string | null
  phone: string | null
  website: string | null
  lat: number
  lng: number
}

const PRIMARY_TAGS = ['shop', 'amenity', 'office', 'tourism', 'leisure', 'craft', 'healthcare', 'clinic']

function parseOSMElement(el: any): BusinessInput | null {
  const lat = el.type === 'node' ? el.lat : el.center?.lat
  const lng = el.type === 'node' ? el.lon : el.center?.lon
  if (lat == null || lng == null) return null
  const tags = el.tags ?? {}
  const name: string = tags.name
  if (!name?.trim()) return null

  let type: string | null = null
  let category: string | null = null
  for (const key of PRIMARY_TAGS) {
    if (tags[key]) { type = key; category = tags[key]; break }
  }

  return {
    externalId: `osm:${el.type}/${el.id}`,
    name: name.trim(),
    type,
    category,
    number: tags['addr:housenumber'] ?? null,
    street: tags['addr:street'] ?? null,
    city: tags['addr:city'] ?? null,
    region: tags['addr:state'] ?? null,
    postcode: tags['addr:postcode'] ?? null,
    phone: tags.phone ?? tags['contact:phone'] ?? null,
    website: tags.website ?? tags['contact:website'] ?? null,
    lat,
    lng,
  }
}

const BATCH_SIZE = 50

export function BusinessImportClient() {
  const [city, setCity] = useState('Orem')
  const [state, setState] = useState('Utah')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState('')

  async function handleImport() {
    setStatus('fetching')
    setMessage('')
    setProgress('Querying OpenStreetMap…')

    const query = `
[out:json][timeout:60];
area["name"="${city}"]["admin_level"~"8|6"]["is_in:state"="${state}"]->.searchArea;
(
  node["shop"](area.searchArea);
  node["amenity"](area.searchArea);
  node["office"](area.searchArea);
  node["tourism"](area.searchArea);
  node["leisure"](area.searchArea);
  node["craft"](area.searchArea);
  node["healthcare"](area.searchArea);
  way["shop"](area.searchArea);
  way["amenity"](area.searchArea);
  way["office"](area.searchArea);
);
out center tags;
    `.trim()

    let osmData: any
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query,
      })
      if (!res.ok) throw new Error(`Overpass API error: ${res.status}`)
      osmData = await res.json()
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Failed to fetch from OpenStreetMap')
      return
    }

    const elements: any[] = osmData.elements ?? []
    const parsed = elements.map(parseOSMElement).filter(Boolean) as BusinessInput[]
    setProgress(`Found ${parsed.length} named businesses. Importing…`)
    setStatus('importing')

    let totalImported = 0
    let totalSkipped = 0

    for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
      const batch = parsed.slice(i, i + BATCH_SIZE)
      setProgress(`Importing ${Math.min(i + BATCH_SIZE, parsed.length)} / ${parsed.length}…`)
      try {
        const res = await fetch('/api/businesses/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
        })
        if (!res.ok) throw new Error(`Import failed: ${res.status}`)
        const result = await res.json()
        totalImported += result.imported
        totalSkipped += result.skipped
      } catch (e) {
        setStatus('error')
        setMessage(e instanceof Error ? e.message : 'Import failed')
        return
      }
    }

    setStatus('done')
    setMessage(`Imported ${totalImported} businesses${totalSkipped ? `, skipped ${totalSkipped}` : ''}.`)
    setProgress('')
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-muted/30 p-5 space-y-4">
        <p className="text-sm text-muted-foreground">
          Pulls named businesses from OpenStreetMap (shops, restaurants, offices, amenities, etc.)
          and assigns them to neighborhoods based on location. Re-running updates existing records.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Orem" />
          </div>
          <div className="space-y-1.5">
            <Label>State</Label>
            <Input value={state} onChange={e => setState(e.target.value)} placeholder="Utah" />
          </div>
        </div>
        <Button
          onClick={handleImport}
          disabled={status === 'fetching' || status === 'importing' || !city.trim()}
        >
          {status === 'fetching' ? 'Fetching from OpenStreetMap…' :
           status === 'importing' ? 'Importing…' :
           'Import from OpenStreetMap'}
        </Button>
      </div>

      {progress && (
        <p className="text-sm text-muted-foreground">{progress}</p>
      )}
      {status === 'done' && (
        <p className="text-sm text-green-700 font-medium">{message}</p>
      )}
      {status === 'error' && (
        <p className="text-sm text-destructive">{message}</p>
      )}
    </div>
  )
}
