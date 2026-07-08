'use client'
import dynamic from 'next/dynamic'
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog'
import { HousePanel } from './HousePanel'
import { HouseForm, type HouseFormData } from '@/components/forms/HouseForm'
import type { HouseRow, Neighborhood } from '@/lib/db/schema'
import { parseHouseNumber } from '@/lib/houses'
import { type StatusOption } from '@/lib/statuses'
import { repPalette, type ActivityPoint } from '@/lib/activity'
import type { BusinessRow } from './BusinessPins'
import type { LayerVisibility, ViewportBounds } from './MapView'
import MapStyleToggle, { type MapStyle } from './MapStyleToggle'
import { BusinessPanel } from './BusinessPanel'
import { SearchOverlay } from './SearchOverlay'
import { SearchIcon } from 'lucide-react'
import { LocateMeButton } from './LocateMeButton'

const MapView = dynamic(() => import('./MapView'), { ssr: false })

const HOUSE_ZOOM_THRESHOLD = 14

type NeighborhoodWithCount = Neighborhood & { boundary: GeoJSON.Polygon; houseCount: number }

type Props = {
  currentUser: { id: string; role: string }
}

export function MapShell({ currentUser }: Props) {
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodWithCount[]>([])
  const [houses, setHouses] = useState<HouseRow[]>([])
  const [businesses, setBusinesses] = useState<BusinessRow[]>([])
  const [statuses, setStatuses] = useState<StatusOption[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [layers, setLayers] = useState<LayerVisibility>({ homes: true, businesses: true, activity: false })
  const [mapStyle, setMapStyle] = useState<MapStyle>('streets')
  const [lastCenter, setLastCenter] = useState<{ lat: number; lng: number } | undefined>()
  const [locationReady, setLocationReady] = useState(false)

  const saveLocationTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)
  const bboxFetchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)
  const currentBoundsRef = useRef<ViewportBounds | null>(null)
  const currentZoomRef = useRef<number>(10)

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

  // On mount: load neighborhoods (with house counts) only — houses + businesses load lazily by viewport
  useEffect(() => {
    fetch('/api/statuses')
      .then(r => r.json())
      .then(setStatuses)
      .catch(() => {})
    fetch('/api/neighborhoods')
      .then(r => r.json())
      .then((nbhds: NeighborhoodWithCount[]) => {
        setNeighborhoods(nbhds)
        setDataLoading(false)
      })
      .catch(() => setDataLoading(false))
  }, [])

  function fetchHousesForBounds(bounds: ViewportBounds) {
    const { west, south, east, north } = bounds
    fetch(`/api/houses?bbox=${west},${south},${east},${north}`)
      .then(r => r.json())
      .then((rows: HouseRow[]) => setHouses(rows))
      .catch(() => {})
  }

  function fetchBusinessesForBounds(bounds: ViewportBounds) {
    const { west, south, east, north } = bounds
    fetch(`/api/businesses?bbox=${west},${south},${east},${north}`)
      .then(r => r.json())
      .then((rows: BusinessRow[]) => setBusinesses(rows))
      .catch(() => {})
  }

  const handleViewportChange = useCallback((lat: number, lng: number, zoom: number, bounds: ViewportBounds) => {
    currentZoomRef.current = zoom
    currentBoundsRef.current = bounds

    // Save last position (debounced 5s)
    clearTimeout(saveLocationTimeout.current)
    saveLocationTimeout.current = setTimeout(() => {
      fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastLat: lat, lastLng: lng }),
      }).catch(() => {})
    }, 5000)

    // Load houses + businesses when zoomed in, clear when zoomed out (debounced 300ms)
    clearTimeout(bboxFetchTimeout.current)
    if (zoom >= HOUSE_ZOOM_THRESHOLD) {
      bboxFetchTimeout.current = setTimeout(() => {
        if (currentBoundsRef.current) {
          fetchHousesForBounds(currentBoundsRef.current)
          fetchBusinessesForBounds(currentBoundsRef.current)
        }
      }, 300)
    } else {
      setHouses([])
      setBusinesses([])
    }
  }, [])

  const [activityPoints, setActivityPoints] = useState<ActivityPoint[]>([])
  const isManager = currentUser.role !== 'rep'

  useEffect(() => {
    if (!layers.activity || !isManager) return
    const controller = new AbortController()
    fetch('/api/activity', { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('load failed')))
      .then(setActivityPoints)
      .catch(() => {})
    return () => controller.abort()
  }, [layers.activity, isManager])

  const activityPalette = useMemo(() => repPalette(activityPoints), [activityPoints])

  const [searchOpen, setSearchOpen] = useState(false)
  const [targetLocation, setTargetLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessRow | null>(null)
  const [overrides, setOverrides] = useState<Map<string, Partial<HouseRow>>>(new Map())
  const [selectedHouse, setSelectedHouse] = useState<HouseRow | null>(null)
  const [highlightedHouseId, setHighlightedHouseId] = useState<string | null>(null)
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  const effectiveHouses = useMemo(
    () => houses.map(h => { const o = overrides.get(h.id); return o ? { ...h, ...o } : h }),
    [houses, overrides]
  )

  const statusColors = useMemo(
    () => Object.fromEntries(statuses.map(s => [s.id, s.color])),
    [statuses]
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

  function handleBusinessUpdate(id: string, updates: Partial<BusinessRow>) {
    setBusinesses(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b))
    setSelectedBusiness(prev => prev?.id === id ? { ...prev, ...updates } : prev)
  }

  function handleHouseUpdate(id: string, updates: Partial<HouseRow>) {
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
    if (currentBoundsRef.current && currentZoomRef.current >= HOUSE_ZOOM_THRESHOLD) {
      fetchHousesForBounds(currentBoundsRef.current)
    }
  }

  return (
    <div className="relative h-[calc(100dvh-56px)] w-full">
      {dataLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
          <p className="text-sm text-muted-foreground">Loading map data…</p>
        </div>
      )}
      {locationReady && <MapView
        neighborhoods={neighborhoods}
        houses={effectiveHouses}
        businesses={businesses}
        activityPoints={activityPoints}
        activityPalette={activityPalette}
        layers={layers}
        mapStyle={mapStyle}
        statusColors={statusColors}
        currentUserId={currentUser.id}
        initialCenter={lastCenter}
        targetLocation={targetLocation}
        selectedHouseId={highlightedHouseId}
        onHouseClick={house => { setSelectedBusiness(null); setSelectedHouse(house); setHighlightedHouseId(house.id) }}
        onBusinessClick={business => { setSelectedHouse(null); setSelectedBusiness(business); setHighlightedHouseId(null) }}
        onMapClick={(lat, lng) => {
          setSelectedHouse(null)
          setSelectedBusiness(null)
          setHighlightedHouseId(null)
          setPendingLocation({ lat, lng })
        }}
        onViewportChange={handleViewportChange}
      />}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex items-end justify-between gap-3 px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        {/* Legend and style toggle — bottom left */}
        <div className="flex flex-col items-start gap-2">
          {layers.activity && isManager && (
            activityPoints.length > 0 ? (
              <div className="flex max-w-[50%] flex-wrap items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs shadow-lg backdrop-blur-sm">
                {[...activityPalette.entries()].map(([userId, color]) => (
                  <span key={userId} className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                    {activityPoints.find(p => p.userId === userId)?.repName ?? 'Unknown'}
                  </span>
                ))}
              </div>
            ) : (
              <div className="rounded-full border bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur-sm">
                No activity today
              </div>
            )
          )}
          <MapStyleToggle value={mapStyle} onChange={setMapStyle} />
        </div>
        {/* Layer toggle + search — bottom right */}
        <div className="flex items-center gap-2">
          <LocateMeButton onLocate={(lat, lng) => setTargetLocation({ lat, lng })} />
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center justify-center h-9 w-9 rounded-full border bg-background/95 shadow-lg backdrop-blur-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Search"
          >
            <SearchIcon className="h-4 w-4" />
          </button>
          <div className="flex rounded-full border bg-background/95 shadow-lg backdrop-blur-sm overflow-hidden text-sm font-medium">
            {(isManager ? (['homes', 'businesses', 'activity'] as const) : (['homes', 'businesses'] as const)).map(key => (
              <button
                key={key}
                onClick={() => setLayers(prev => ({ ...prev, [key]: !prev[key] }))}
                className={`px-4 py-2 transition-colors capitalize ${layers[key] ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {key === 'homes' ? 'Homes' : key === 'businesses' ? 'Businesses' : 'Activity'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={result => {
          const { lat, lng } = result.item
          setTargetLocation({ lat, lng })
          if (result.kind === 'house') {
            setSelectedBusiness(null)
            setSelectedHouse(result.item)
            setHighlightedHouseId(result.item.id)
          } else {
            setSelectedHouse(null)
            setSelectedBusiness(result.item)
            setHighlightedHouseId(null)
          }
        }}
      />
      <BusinessPanel
        business={selectedBusiness}
        statuses={statuses}
        currentUser={currentUser}
        onBusinessUpdate={handleBusinessUpdate}
        onClose={() => setSelectedBusiness(null)}
      />
      <HousePanel
        house={selectedHouse}
        statuses={statuses}
        currentUser={currentUser}
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
