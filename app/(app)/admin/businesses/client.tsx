'use client'
import { useRef, useState } from 'react'
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

// ── OSM ──────────────────────────────────────────────────────────────────────

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

// ── Overture ──────────────────────────────────────────────────────────────────

function parseOvertureFeature(feature: any): BusinessInput | null {
  if (feature.geometry?.type !== 'Point') return null
  const [lng, lat] = feature.geometry.coordinates
  if (lng == null || lat == null) return null

  const props = feature.properties ?? {}
  const name: string = props.names?.primary
  if (!name?.trim()) return null

  // Skip very low-confidence results (spam, duplicates)
  if (props.confidence != null && props.confidence < 0.4) return null

  const addr = props.addresses?.[0]
  const freeform: string = addr?.freeform ?? ''
  // Split "123 Main St" → number + street
  const addrMatch = freeform.match(/^(\d+[A-Za-z]?)\s+(.+)$/)
  const number = addrMatch?.[1] ?? null
  const street = addrMatch ? addrMatch[2] : (freeform || null)

  return {
    externalId: `overture:${props.id}`,
    name: name.trim(),
    type: 'overture',
    category: props.categories?.primary ?? null,
    number,
    street,
    city: addr?.locality ?? null,
    region: addr?.region ?? null,
    postcode: addr?.postcode ?? null,
    phone: props.phones?.[0] ?? null,
    website: props.websites?.[0] ?? null,
    lat,
    lng,
  }
}

// ── Shared import ─────────────────────────────────────────────────────────────

const BATCH_SIZE = 50

async function batchImport(
  items: BusinessInput[],
  onProgress: (msg: string) => void,
): Promise<{ imported: number; skipped: number }> {
  let totalImported = 0
  let totalSkipped = 0

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    onProgress(`Importing ${Math.min(i + BATCH_SIZE, items.length)} / ${items.length}…`)
    const res = await fetch('/api/businesses/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `Import failed: ${res.status}`)
    }
    const result = await res.json()
    totalImported += result.imported
    totalSkipped += result.skipped
  }

  return { imported: totalImported, skipped: totalSkipped }
}

// ── OSM section ───────────────────────────────────────────────────────────────

export function OSMImportSection() {
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
[out:json][timeout:90];
area["name"="${state}"]["admin_level"="4"]->.stateArea;
area["name"="${city}"]["admin_level"~"8|6"](area.stateArea)->.searchArea;
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
      const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Overpass error ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`)
      }
      osmData = await res.json()
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Failed to fetch from OpenStreetMap')
      return
    }

    const elements: any[] = osmData.elements ?? []
    if (elements.length === 0) {
      setStatus('error')
      setMessage(`No results. Check that "${city}" and "${state}" match OSM names exactly (e.g. "Utah" not "UT").`)
      return
    }

    const parsed = elements.map(parseOSMElement).filter(Boolean) as BusinessInput[]
    setProgress(`Found ${parsed.length} named businesses. Importing…`)
    setStatus('importing')

    try {
      const { imported, skipped } = await batchImport(parsed, setProgress)
      setStatus('done')
      setMessage(`Imported ${imported} businesses${skipped ? `, skipped ${skipped}` : ''}.`)
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Import failed')
    }
    setProgress('')
  }

  return (
    <div className="rounded-xl border bg-muted/30 p-5 space-y-4">
      <div>
        <h3 className="font-medium text-sm">OpenStreetMap</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Good location accuracy, limited address coverage.
        </p>
      </div>
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
      <Button onClick={handleImport} disabled={status === 'fetching' || status === 'importing' || !city.trim()}>
        {status === 'fetching' ? 'Fetching…' : status === 'importing' ? 'Importing…' : 'Import from OpenStreetMap'}
      </Button>
      {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
      {status === 'done' && <p className="text-sm text-green-700 font-medium">{message}</p>}
      {status === 'error' && <p className="text-sm text-destructive">{message}</p>}
    </div>
  )
}

// ── Overture section ──────────────────────────────────────────────────────────

export function OvertureImportSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setStatus('fetching')
    setMessage('')
    setProgress('Reading file…')

    let geojson: any
    try {
      const text = await file.text()
      geojson = JSON.parse(text)
    } catch {
      setStatus('error')
      setMessage('Could not parse file — expected GeoJSON.')
      return
    }

    const features: any[] = geojson.type === 'FeatureCollection'
      ? geojson.features
      : geojson.type === 'Feature'
        ? [geojson]
        : []

    if (features.length === 0) {
      setStatus('error')
      setMessage('No features found in file.')
      return
    }

    const parsed = features.map(parseOvertureFeature).filter(Boolean) as BusinessInput[]
    setProgress(`Parsed ${parsed.length} businesses from ${features.length} features. Importing…`)
    setStatus('importing')

    try {
      const { imported, skipped } = await batchImport(parsed, setProgress)
      setStatus('done')
      setMessage(`Imported ${imported} businesses${skipped ? `, skipped ${skipped}` : ''}.`)
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Import failed')
    }
    setProgress('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="rounded-xl border bg-muted/30 p-5 space-y-4">
      <div>
        <h3 className="font-medium text-sm">Overture Maps</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Better business coverage and address data. Download first:
        </p>
        <pre className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs font-mono whitespace-pre-wrap">
{`pip install overturemaps
overturemaps download \\
  --bbox=-111.75,40.18,-111.61,40.36 \\
  -f geojson --type=place \\
  -o overture_places.geojson`}
        </pre>
      </div>
      <div className="space-y-1.5">
        <Label>GeoJSON file</Label>
        <Input ref={fileRef} type="file" accept=".geojson,.json" onChange={handleFile}
          disabled={status === 'fetching' || status === 'importing'} />
      </div>
      {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
      {status === 'done' && <p className="text-sm text-green-700 font-medium">{message}</p>}
      {status === 'error' && <p className="text-sm text-destructive">{message}</p>}
    </div>
  )
}

// ── Page component ────────────────────────────────────────────────────────────

export function BusinessImportClient() {
  return (
    <div className="space-y-6">
      <OSMImportSection />
      <OvertureImportSection />
    </div>
  )
}
