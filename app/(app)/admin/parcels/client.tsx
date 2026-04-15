'use client'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Status = 'idle' | 'parsing' | 'importing' | 'done' | 'error'

type ParcelItem = {
  ownerName: string
  geom: object
}

type Bbox = [number, number, number, number] // [minLng, minLat, maxLng, maxLat]

// Field names used by SGID / ArcGIS exports (try in order)
const OWNER_FIELDS = [
  'OWN_NAME1', 'own_name1',
  'OWNERNAME', 'OwnerName', 'owner_name',
  'OWN_NAME', 'own_name',
  'OWNER_NAME', 'OWNER', 'owner',
  'NAME1', 'name1',
]

function detectOwnerField(props: Record<string, unknown>): string | null {
  for (const field of OWNER_FIELDS) {
    if (typeof props[field] === 'string' && (props[field] as string).trim()) return field
  }
  return null
}

// Recursively walk coordinates array (handles Polygon, MultiPolygon)
function geomBbox(geom: any): Bbox | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity

  function walk(c: any) {
    if (!Array.isArray(c)) return
    if (typeof c[0] === 'number') {
      if (c[0] < minLng) minLng = c[0]
      if (c[1] < minLat) minLat = c[1]
      if (c[0] > maxLng) maxLng = c[0]
      if (c[1] > maxLat) maxLat = c[1]
    } else {
      for (const item of c) walk(item)
    }
  }

  walk(geom?.coordinates)
  return isFinite(minLng) ? [minLng, minLat, maxLng, maxLat] : null
}

function bboxOverlaps(a: Bbox, b: Bbox): boolean {
  return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1])
}

// "SMITH JOHN D" → "Smith John D"
function titleCase(s: string): string {
  return s.trim().replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

const BATCH_SIZE = 25

export function ParcelImportClient() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState('')
  const [detectedField, setDetectedField] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setStatus('parsing')
    setMessage('')
    setDetectedField(null)
    setProgress('Reading file — this may take a moment for large files…')

    let features: any[]
    try {
      const text = await file.text()
      setProgress('Parsing GeoJSON…')
      const geojson = JSON.parse(text)
      features = geojson.type === 'FeatureCollection'
        ? geojson.features
        : geojson.type === 'Feature'
          ? [geojson]
          : []
    } catch {
      setStatus('error')
      setMessage('Could not parse file — expected GeoJSON.')
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    if (features.length === 0) {
      setStatus('error')
      setMessage('No features found in file.')
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    // Detect owner name field from first several features
    let ownerField: string | null = null
    for (const f of features.slice(0, 20)) {
      ownerField = detectOwnerField(f.properties ?? {})
      if (ownerField) break
    }

    if (!ownerField) {
      const sampleKeys = Object.keys(features[0]?.properties ?? {}).slice(0, 12).join(', ')
      setStatus('error')
      setMessage(`Could not detect owner name field. Available fields: ${sampleKeys || 'none'}`)
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    setDetectedField(ownerField)

    // Fetch neighborhood bounding boxes to filter out parcels outside our area
    setProgress('Loading neighborhoods…')
    let neighborhoodBbox: Bbox | null = null
    try {
      const res = await fetch('/api/neighborhoods')
      if (res.ok) {
        const nbhds: any[] = await res.json()
        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
        for (const n of nbhds) {
          const b = geomBbox(n.boundary)
          if (b) {
            if (b[0] < minLng) minLng = b[0]
            if (b[1] < minLat) minLat = b[1]
            if (b[2] > maxLng) maxLng = b[2]
            if (b[3] > maxLat) maxLat = b[3]
          }
        }
        if (isFinite(minLng)) {
          // Add 0.01° buffer (~1km) around neighborhood boundaries
          neighborhoodBbox = [minLng - 0.01, minLat - 0.01, maxLng + 0.01, maxLat + 0.01]
        }
      }
    } catch { /* skip bbox filtering if fetch fails */ }

    setProgress('Filtering parcels…')

    const items: ParcelItem[] = features
      .filter(f => {
        const gtype = f.geometry?.type
        if (gtype !== 'Polygon' && gtype !== 'MultiPolygon') return false
        if (typeof f.properties?.[ownerField!] !== 'string') return false
        if (!f.properties[ownerField!].trim()) return false
        // Skip parcels outside the neighborhood area
        if (neighborhoodBbox) {
          const parcelBbox = geomBbox(f.geometry)
          if (parcelBbox && !bboxOverlaps(parcelBbox, neighborhoodBbox)) return false
        }
        return true
      })
      .map(f => ({
        ownerName: titleCase(f.properties[ownerField!]),
        geom: f.geometry,
      }))

    if (items.length === 0) {
      setStatus('error')
      setMessage(
        neighborhoodBbox
          ? `No parcels found within your neighborhood area. Check that the file covers your neighborhoods.`
          : `No parcel polygons with owner names found using field "${ownerField}".`
      )
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    const filtered = features.length - items.length
    setStatus('importing')
    setProgress(
      `Found ${items.length.toLocaleString()} parcels in your area` +
      (filtered > 0 ? ` (filtered out ${filtered.toLocaleString()} outside neighborhoods)` : '') +
      `. Importing…`
    )

    let totalUpdated = 0
    let totalCreated = 0

    try {
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE)
        setProgress(`Importing ${Math.min(i + BATCH_SIZE, items.length).toLocaleString()} / ${items.length.toLocaleString()}…`)
        const res = await fetch('/api/parcels/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `Import failed: ${res.status}`)
        }
        const result = await res.json()
        totalUpdated += result.updated ?? 0
        totalCreated += result.created ?? 0
      }
      setStatus('done')
      setMessage(
        `Done: ${totalUpdated.toLocaleString()} households updated, ` +
        `${totalCreated.toLocaleString()} new households created.`
      )
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Import failed')
    }

    setProgress('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-xl font-semibold mb-1">Parcel Owner Names</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Populate household owner names from Utah County parcel data. Download the GeoJSON from{' '}
        <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">Utah county basic parcels</span>{' '}
        on gis.utah.gov → Data → Cadastre → Parcels.
      </p>

      <div className="rounded-xl border bg-muted/30 p-5 space-y-4">
        <div className="space-y-1.5">
          <Label>GeoJSON file</Label>
          <Input
            ref={fileRef}
            type="file"
            accept=".geojson,.json"
            onChange={handleFile}
            disabled={status === 'parsing' || status === 'importing'}
          />
          <p className="text-xs text-muted-foreground">
            Full county files are fine — parcels outside your neighborhoods are filtered out automatically.
          </p>
        </div>

        {detectedField && status !== 'error' && (
          <p className="text-xs text-muted-foreground">
            Owner name field detected: <code className="font-mono">{detectedField}</code>
          </p>
        )}
        {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
        {status === 'done' && <p className="text-sm text-green-700 font-medium">{message}</p>}
        {status === 'error' && <p className="text-sm text-destructive">{message}</p>}

        {status === 'done' && (
          <Button variant="outline" onClick={() => { setStatus('idle'); setMessage(''); setDetectedField(null) }}>
            Import another file
          </Button>
        )}
      </div>
    </div>
  )
}
