'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { HousePanel } from './HousePanel'
import { HouseForm, type HouseFormData } from '@/components/forms/HouseForm'
import type { HouseRow, Neighborhood } from '@/lib/db/schema'

const MapView = dynamic(() => import('./MapView'), { ssr: false })

type Props = {
  neighborhoods: (Neighborhood & { boundary: GeoJSON.Polygon })[]
  houses: (HouseRow & { lastOutcome?: string | null })[]
  userRole: string
}

export function MapShell({ neighborhoods, houses, userRole }: Props) {
  const router = useRouter()
  const [selectedHouse, setSelectedHouse] = useState<HouseRow | null>(null)
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

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
    router.refresh()
  }

  return (
    <div className="relative h-[calc(100vh-56px)] w-full">
      <MapView
        neighborhoods={neighborhoods}
        houses={houses}
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
