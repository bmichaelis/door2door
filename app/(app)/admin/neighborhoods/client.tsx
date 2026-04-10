'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const DrawMap = dynamic(() => import('@/components/map/DrawMap').then(m => ({ default: m.DrawMap })), { ssr: false })

type Team = { id: string; name: string }
type Neighborhood = { id: string; name: string; city: string | null; team_id: string | null; team_name: string | null }

type Props = { neighborhoods: Neighborhood[]; teams: Team[] }

export function NeighborhoodAdminClient({ neighborhoods: initial, teams }: Props) {
  const [neighborhoods, setNeighborhoods] = useState(initial)
  const [mode, setMode] = useState<'list' | 'draw' | 'import'>('list')
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [teamId, setTeamId] = useState('')
  const [drawnPolygon, setDrawnPolygon] = useState<GeoJSON.Polygon | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; city: string; teamId: string }>({ name: '', city: '', teamId: '' })
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function startEdit(n: Neighborhood) {
    setEditingId(n.id)
    setEditForm({ name: n.name, city: n.city ?? '', teamId: n.team_id ?? '' })
    setConfirmDeleteId(null)
  }

  async function handleSaveEdit() {
    if (!editingId) return
    setSaving(true)
    const res = await fetch(`/api/neighborhoods/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name,
        city: editForm.city || null,
        teamId: editForm.teamId || null,
      }),
    })
    setSaving(false)
    if (!res.ok) return
    setNeighborhoods(prev => prev.map(n => {
      if (n.id !== editingId) return n
      const team = teams.find(t => t.id === editForm.teamId)
      return { ...n, name: editForm.name, city: editForm.city || null, team_id: editForm.teamId || null, team_name: team?.name ?? null }
    }))
    setEditingId(null)
  }

  async function handleDelete(id: string) {
    setSaving(true)
    await fetch(`/api/neighborhoods/${id}`, { method: 'DELETE' })
    setSaving(false)
    setNeighborhoods(prev => prev.filter(n => n.id !== id))
    setConfirmDeleteId(null)
  }

  async function handleSave() {
    if (!drawnPolygon || !name) return
    const res = await fetch('/api/neighborhoods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, city: city || null, teamId: teamId || null, boundary: drawnPolygon }),
    })
    if (res.ok) window.location.reload()
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
    const res = await fetch('/api/neighborhoods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, city: city || null, teamId: teamId || null, boundary: geometry }),
    })
    if (res.ok) window.location.reload()
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

      {mode === 'import' && (
        <div className="mb-4 flex gap-3 items-end flex-wrap">
          <div>
            <label className="text-sm font-medium block mb-1">Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Neighborhood name" className="w-48" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">City</label>
            <Input value={city} onChange={e => setCity(e.target.value)} placeholder="City" className="w-32" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Assign to Team</label>
            <Select value={teamId} onValueChange={v => setTeamId(v ?? '')}>
              <SelectTrigger className="w-40"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">GeoJSON File</label>
            <Input type="file" accept=".json,.geojson" onChange={handleImport} />
          </div>
          <Button variant="ghost" onClick={() => setMode('list')}>Cancel</Button>
        </div>
      )}

      {mode === 'draw' && (
        <div className="fixed inset-0 z-50">
          <DrawMap onDrawComplete={setDrawnPolygon} />
          <div className="absolute top-4 left-4 z-10 bg-white rounded-lg shadow-lg p-4 flex flex-col gap-3 w-64">
            <div>
              <label className="text-sm font-medium block mb-1">Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Neighborhood name" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">City</label>
              <Input value={city} onChange={e => setCity(e.target.value)} placeholder="City" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Assign to Team</label>
              <Select value={teamId} onValueChange={v => setTeamId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!drawnPolygon && (
              <p className="text-xs text-muted-foreground">Use the polygon tool (top right of map) to draw a boundary</p>
            )}
            <div className="flex gap-2">
              {drawnPolygon && <Button onClick={handleSave} className="flex-1">Save</Button>}
              <Button variant="ghost" onClick={() => setMode('list')} className="flex-1">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {neighborhoods.map(n => {
          if (editingId === n.id) {
            return (
              <li key={n.id} className="border rounded p-3 flex items-end gap-3 flex-wrap">
                <div>
                  <label className="text-xs font-medium block mb-1">Name</label>
                  <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-44" />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">City</label>
                  <Input value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} className="w-28" />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">Team</label>
                  <Select value={editForm.teamId} onValueChange={v => setEditForm(f => ({ ...f, teamId: v ?? '' }))}>
                    <SelectTrigger className="w-36"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Unassigned</SelectItem>
                      {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleSaveEdit} disabled={saving} size="sm">Save</Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
              </li>
            )
          }

          if (confirmDeleteId === n.id) {
            return (
              <li key={n.id} className="border border-destructive rounded p-3 flex items-center justify-between">
                <span className="text-sm">Delete <strong>{n.name}</strong>? This will unassign all its houses.</span>
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" disabled={saving} onClick={() => handleDelete(n.id)}>Delete</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                </div>
              </li>
            )
          }

          return (
            <li key={n.id} className="flex items-center justify-between border rounded p-3">
              <div>
                <span className="font-medium">{n.name}</span>
                {n.city && <span className="ml-2 text-xs text-muted-foreground">{n.city}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{n.team_name ?? 'Unassigned'}</span>
                <Button variant="outline" size="sm" onClick={() => startEdit(n)}>Edit</Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => { setConfirmDeleteId(n.id); setEditingId(null) }}>Delete</Button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
