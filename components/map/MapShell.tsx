'use client'
import dynamic from 'next/dynamic'
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog'
import { HousePanel } from './HousePanel'
import { HouseForm, type HouseFormData } from '@/components/forms/HouseForm'
import type { Neighborhood } from '@/lib/db/schema'
import { type HouseWithOutcome, parseHouseNumber } from '@/lib/houses'
import type { BusinessRow } from './BusinessPins'
import type { LayerVisibility } from './MapView'
import { BusinessPanel } from './BusinessPanel'

const MapView = dynamic(() => import('./MapView'), { ssr: false })

export type { HouseWithOutcome }

type Props = {
  userRole: string
}

export function MapShell({ userRole }: Props) {
  const [neighborhoods, setNeighborhoods] = useState<(Neighborhood & { boundary: GeoJSON.Polygon })[]>([])
  const [houses, setHouses] = useState<HouseWithOutcome[]>([])
  const [businesses, setBusinesses] = useState<BusinessRow[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [layers, setLayers] = useState<LayerVisibility>({ homes: true, businesses: true })
  const [lastCenter, setLastCenter] = useState<{ lat: number; lng: number } | undefined>()
  const [locationReady, setLocationReady] = useState(false)
  const saveLocationTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    fetch('/api/users/me')
      .then(r => r.json())
      .then(data => {
        if (data.lastLat != null && data.lastLng != null) {
          setLastCenter({ lat: data.lastLat, lng: data.lastLng })
        }
      })
      .catch(() => {})
      .finally(() => setLocationReady(true))
  }, [])

  const handleViewportChange = useCallback((lat: number, lng: number) => {
    clearTimeout(saveLocationTimeout.current)
    saveLocationTimeout.current = setTimeout(() => {
      fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastLat: lat, lastLng: lng }),
      }).catch(() => {})
    }, 5000)
  }, [])

  useEffect(() => {
    fetch('/api/neighborhoods')
      .then(r => r.json())
      .then(async (nbhds: (Neighborhood & { boundary: GeoJSON.Polygon })[]) => {
        setNeighborhoods(nbhds)
        if (!nbhds.length) { setDataLoading(false); return }
        const [houseArrays, bizArrays] = await Promise.all([
          Promise.all(nbhds.map((n: Neighborhood) =>
            fetch(`/api/houses?neighborhoodId=${n.id}`).then(r => r.json())
          )),
          Promise.all(nbhds.map((n: Neighborhood) =>
            fetch(`/api/businesses?neighborhoodId=${n.id}`).then(r => r.json())
          )),
        ])
        setHouses(houseArrays.flat())
        setBusinesses(bizArrays.flat())
        setDataLoading(false)
      })
      .catch(() => setDataLoading(false))
  }, [])

  const [selectedBusiness, setSelectedBusiness] = useState<BusinessRow | null>(null)
  const [overrides, setOverrides] = useState<Map<string, Partial<HouseWithOutcome>>>(new Map())
  const [selectedHouse, setSelectedHouse] = useState<HouseWithOutcome | null>(null)
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  const effectiveHouses = useMemo(
    () => houses.map(h => { const o = overrides.get(h.id); return o ? { ...h, ...o } : h }),
    [houses, overrides]
  )

  const adjacentHouses = useMemo(() => {
    if (!selectedHouse) return { prev: null, next: null }
    const streetHouses = effectiveHouses
      .filter(h => h.street === selectedHouse.street && h.neighborhoodId === selectedHouse.neighborhoodId)
      .sort((a, b) => parseHouseNumber(a.number) - parseHouseNumber(b.number))
    const idx = streetHouses.findIndex(h => h.id === selectedHouse.id)
    return {
      prev: idx > 0 ? streetHouses[idx - 1] : null,
      next: idx < streetHouses.length - 1 ? streetHouses[idx + 1] : null,
    }
  }, [selectedHouse, effectiveHouses])

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
      {locationReady && <MapView
        neighborhoods={neighborhoods}
        houses={effectiveHouses}
        businesses={businesses}
        layers={layers}
        initialCenter={lastCenter}
        onHouseClick={house => { setSelectedBusiness(null); setSelectedHouse(house) }}
        onBusinessClick={business => { setSelectedHouse(null); setSelectedBusiness(business) }}
        onMapClick={(lat, lng) => {
          setSelectedHouse(null)
          setSelectedBusiness(null)
          setPendingLocation({ lat, lng })
        }}
        onViewportChange={handleViewportChange}
      />}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex rounded-full border bg-background/95 shadow-lg backdrop-blur-sm overflow-hidden text-sm font-medium">
        {(['homes', 'businesses'] as const).map(key => (
          <button
            key={key}
            onClick={() => setLayers(prev => ({ ...prev, [key]: !prev[key] }))}
            className={`px-4 py-2 transition-colors capitalize ${layers[key] ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {key === 'homes' ? 'Homes' : 'Businesses'}
          </button>
        ))}
      </div>
      <BusinessPanel
        business={selectedBusiness}
        onClose={() => setSelectedBusiness(null)}
      />
      <HousePanel
        house={selectedHouse}
        userRole={userRole}
        onClose={() => setSelectedHouse(null)}
        onHouseUpdate={handleHouseUpdate}
        prevHouse={adjacentHouses.prev}
        nextHouse={adjacentHouses.next}
        onHouseChange={setSelectedHouse}
      />
      <Dialog open={!!pendingLocation} onOpenChange={open => !open && (setPendingLocation(null), setAddError(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add House</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {addError && (
              <p className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{addError}</p>
            )}
            {pendingLocation && (
              <HouseForm
                lat={pendingLocation.lat}
                lng={pendingLocation.lng}
                onSubmit={handleAddHouse}
                onCancel={() => { setPendingLocation(null); setAddError(null) }}
              />
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}
