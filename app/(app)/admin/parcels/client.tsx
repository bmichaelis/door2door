'use client'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Status = 'idle' | 'parsing' | 'importing' | 'done' | 'error'

type ParcelItem = {
  ownerName: string
  address: string  // normalized "NUMBER STREET" e.g. "1695 N 350 WEST ST"
}

// Owner name field names used by SGID / ArcGIS exports
const OWNER_FIELDS = [
  'OWN_NAME1', 'own_name1',
  'OWNERNAME', 'OwnerName', 'owner_name',
  'OWN_NAME', 'own_name',
  'OWNER_NAME', 'OWNER', 'owner',
  'NAME1', 'name1',
]

// Address field names used by SGID / ArcGIS exports
const ADDRESS_FIELDS = [
  'PARCEL_ADD', 'parcel_add',
  'SITUS_ADDR', 'situs_addr',
  'SITE_ADDRESS', 'site_address',
  'ADDRESS', 'address',
  'ADDR', 'addr',
]

function detectField(props: Record<string, unknown>, candidates: string[]): string | null {
  for (const field of candidates) {
    if (typeof props[field] === 'string' && (props[field] as string).trim()) return field
  }
  return null
}

// "SMITH JOHN D" → "Smith John D"
function titleCase(s: string): string {
  return s.trim().replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

// "1695 N 350 WEST ST, PROVO UT 84601" → "1695 N 350 WEST ST"
function normalizeAddress(raw: string): string {
  return raw.split(',')[0].trim().toUpperCase()
}

const BATCH_SIZE = 200

export function ParcelImportClient() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState('')
  const [detectedFields, setDetectedFields] = useState<{ owner: string; address: string } | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setStatus('parsing')
    setMessage('')
    setDetectedFields(null)
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

    // Detect field names from first several features
    let ownerField: string | null = null
    let addressField: string | null = null
    for (const f of features.slice(0, 20)) {
      const props = f.properties ?? {}
      ownerField ??= detectField(props, OWNER_FIELDS)
      addressField ??= detectField(props, ADDRESS_FIELDS)
      if (ownerField && addressField) break
    }

    if (!ownerField || !addressField) {
      const sampleKeys = Object.keys(features[0]?.properties ?? {}).slice(0, 12).join(', ')
      setStatus('error')
      setMessage(
        `Could not detect ${!ownerField ? 'owner name' : 'address'} field. ` +
        `Available fields: ${sampleKeys || 'none'}`
      )
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    setDetectedFields({ owner: ownerField, address: addressField })
    setProgress('Extracting parcels…')

    const items: ParcelItem[] = []
    for (const f of features) {
      const props = f.properties ?? {}
      const owner = typeof props[ownerField] === 'string' ? props[ownerField].trim() : ''
      const addr = typeof props[addressField] === 'string' ? props[addressField].trim() : ''
      if (owner && addr) {
        items.push({ ownerName: titleCase(owner), address: normalizeAddress(addr) })
      }
    }

    if (items.length === 0) {
      setStatus('error')
      setMessage('No parcels with both an owner name and address found.')
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

        {detectedFields && status !== 'error' && (
          <p className="text-xs text-muted-foreground">
            Owner: <code className="font-mono">{detectedFields.owner}</code>
            {' · '}
            Address: <code className="font-mono">{detectedFields.address}</code>
          </p>
        )}
        {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
        {status === 'done' && <p className="text-sm text-green-700 font-medium">{message}</p>}
        {status === 'error' && <p className="text-sm text-destructive">{message}</p>}

        {status === 'done' && (
          <Button variant="outline" onClick={() => { setStatus('idle'); setMessage(''); setDetectedFields(null) }}>
            Import another file
          </Button>
        )}
      </div>
    </div>
  )
}
