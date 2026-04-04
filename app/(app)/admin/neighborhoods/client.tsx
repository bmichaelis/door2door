'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { DrawControl } from '@/components/map/DrawControl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const Map = dynamic(() => import('react-map-gl').then(m => ({ default: m.default })), { ssr: false })

type Team = { id: string; name: string }
type Neighborhood = { id: string; name: string; team_id: string | null; team_name: string | null }

type Props = { neighborhoods: Neighborhood[]; teams: Team[] }

export function NeighborhoodAdminClient({ neighborhoods, teams }: Props) {
  const [mode, setMode] = useState<'list' | 'draw' | 'import'>('list')
  const [name, setName] = useState('')
  const [teamId, setTeamId] = useState('')
  const [drawnPolygon, setDrawnPolygon] = useState<GeoJSON.Polygon | null>(null)

  async function handleSave() {
    if (!drawnPolygon || !name) return
    await fetch('/api/neighborhoods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, teamId: teamId || null, boundary: drawnPolygon }),
    })
    window.location.reload()
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !name) return
    const text = await file.text()
    const geojson = JSON.parse(text)
    const geometry = geojson.type === 'FeatureCollection'
      ? geojson.features[0]?.geometry
      : geojson.type === 'Feature' ? geojson.geometry : geojson
    if (!geometry) return
    await fetch('/api/neighborhoods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, teamId: teamId || null, boundary: geometry }),
    })
    window.location.reload()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Neighborhoods</h1>
        <div className="flex gap-2">
          <Button onClick={() => setMode('draw')} variant="outline">Draw Boundary</Button>
          <Button onClick={() => setMode('import')} variant="outline">Import GeoJSON</Button>
        </div>
      </div>

      {(mode === 'draw' || mode === 'import') && (
        <div className="mb-4 flex gap-3 items-end flex-wrap">
          <div>
            <label className="text-sm font-medium block mb-1">Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Neighborhood name" className="w-48" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Assign to Team</label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger className="w-40"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {mode === 'import' && (
            <div>
              <label className="text-sm font-medium block mb-1">GeoJSON File</label>
              <Input type="file" accept=".json,.geojson" onChange={handleImport} />
            </div>
          )}
          {mode === 'draw' && drawnPolygon && (
            <Button onClick={handleSave}>Save Neighborhood</Button>
          )}
          <Button variant="ghost" onClick={() => setMode('list')}>Cancel</Button>
        </div>
      )}

      {mode === 'draw' && (
        <div className="h-96 mb-4 rounded overflow-hidden border">
          <Map
            mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
            initialViewState={{ longitude: -98.5795, latitude: 39.8283, zoom: 10 }}
            mapStyle="mapbox://styles/mapbox/streets-v12"
            style={{ width: '100%', height: '100%' }}
          >
            <DrawControl onDrawComplete={setDrawnPolygon} />
          </Map>
        </div>
      )}

      <ul className="space-y-2">
        {neighborhoods.map(n => (
          <li key={n.id} className="flex items-center justify-between border rounded p-3">
            <span className="font-medium">{n.name}</span>
            <span className="text-sm text-muted-foreground">{n.team_name ?? 'Unassigned'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
