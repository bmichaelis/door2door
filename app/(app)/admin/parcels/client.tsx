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

    const items: ParcelItem[] = features
      .filter(f => {
        const gtype = f.geometry?.type
        return (gtype === 'Polygon' || gtype === 'MultiPolygon') &&
          typeof f.properties?.[ownerField!] === 'string' &&
          f.properties[ownerField!].trim()
      })
      .map(f => ({
        ownerName: titleCase(f.properties[ownerField!]),
        geom: f.geometry,
      }))

    if (items.length === 0) {
      setStatus('error')
      setMessage(`No parcel polygons with owner names found using field "${ownerField}".`)
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    setStatus('importing')
    setProgress(`Found ${items.length.toLocaleString()} parcels. Importing…`)

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
            Large files (100 MB+) will take a moment to parse in the browser.
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
