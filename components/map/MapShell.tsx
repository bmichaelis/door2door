'use client'
import dynamic from 'next/dynamic'
import { useState, useMemo, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { HousePanel } from './HousePanel'
import { HouseForm, type HouseFormData } from '@/components/forms/HouseForm'
import type { HouseRow, Neighborhood } from '@/lib/db/schema'

const MapView = dynamic(() => import('./MapView'), { ssr: false })

export type HouseWithOutcome = HouseRow & { lastOutcome?: string | null }

type Props = {
  userRole: string
}

export function MapShell({ userRole }: Props) {
  const [neighborhoods, setNeighborhoods] = useState<(Neighborhood & { boundary: GeoJSON.Polygon })[]>([])
  const [houses, setHouses] = useState<HouseWithOutcome[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    fetch('/api/neighborhoods')
      .then(r => r.json())
      .then(async (nbhds: (Neighborhood & { boundary: GeoJSON.Polygon })[]) => {
        setNeighborhoods(nbhds)
        if (!nbhds.length) { setDataLoading(false); return }
        const houseArrays = await Promise.all(
          nbhds.map((n: Neighborhood) =>
            fetch(`/api/houses?neighborhoodId=${n.id}`).then(r => r.json())
          )
        )
        setHouses(houseArrays.flat())
        setDataLoading(false)
      })
      .catch(() => setDataLoading(false))
  }, [])

  const [overrides, setOverrides] = useState<Map<string, Partial<HouseWithOutcome>>>(new Map())
  const [selectedHouse, setSelectedHouse] = useState<HouseWithOutcome | null>(null)
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  const effectiveHouses = useMemo(
    () => houses.map(h => { const o = overrides.get(h.id); return o ? { ...h, ...o } : h }),
    [houses, overrides]
  )

  function handleHouseUpdate(id: string, updates: Partial<HouseWithOutcome>) {
    setOverrides(prev => {
      const next = new Map(prev)
      next.set(id, { ...(prev.get(id) ?? {}), ...updates })
      return next
    })
    setSelectedHouse(prev => prev?.id === id ? { ...prev, ...updates } : prev)
  }

  async function handleAddHouse(data: HouseFormData) {
    if (!pendingLocation) return
    setAddError(null)
    const res = await fetch('/api/houses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, lat: pendingLocation.lat, lng: pendingLocation.lng }),
    })
    if (!res.ok) {
      setAddError('Failed to add house. Please try again.')
      return
    }
    setPendingLocation(null)
    fetch('/api/neighborhoods')
      .then(r => r.json())
      .then((nbhds: Neighborhood[]) =>
        Promise.all(nbhds.map(n => fetch(`/api/houses?neighborhoodId=${n.id}`).then(r => r.json())))
      )
      .then(arrays => setHouses(arrays.flat()))
  }

  return (
    <div className="relative h-[calc(100vh-56px)] w-full">
      {dataLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
          <p className="text-sm text-muted-foreground">Loading map data…</p>
        </div>
      )}
      <MapView
        neighborhoods={neighborhoods}
        houses={effectiveHouses}
        onHouseClick={house => setSelectedHouse(house)}
        onMapClick={(lat, lng) => {
          setSelectedHouse(null)
          setPendingLocation({ lat, lng })
        }}
      />
      <HousePanel
        house={selectedHouse}
        userRole={userRole}
        onClose={() => setSelectedHouse(null)}
        onHouseUpdate={handleHouseUpdate}
      />
      <Sheet open={!!pendingLocation} onOpenChange={(open: boolean) => !open && (setPendingLocation(null), setAddError(null))}>
        <SheetContent side="bottom" className="h-auto">
          <SheetHeader>
            <SheetTitle>Add House</SheetTitle>
          </SheetHeader>
          {addError && (
            <p className="mt-2 text-sm text-destructive">{addError}</p>
          )}
          {pendingLocation && (
            <div className="mt-4">
              <HouseForm
                lat={pendingLocation.lat}
                lng={pendingLocation.lng}
                onSubmit={handleAddHouse}
                onCancel={() => { setPendingLocation(null); setAddError(null) }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
