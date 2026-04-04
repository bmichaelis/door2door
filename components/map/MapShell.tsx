'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { HousePanel } from './HousePanel'
import type { House, Neighborhood } from '@/lib/db/schema'

const MapView = dynamic(() => import('./MapView'), { ssr: false })

type Props = {
  neighborhoods: (Neighborhood & { boundary: GeoJSON.Polygon })[]
  houses: (House & { lastOutcome?: string | null })[]
  userRole: string
}

export function MapShell({ neighborhoods, houses, userRole }: Props) {
  const [selectedHouse, setSelectedHouse] = useState<House | null>(null)

  return (
    <div className="relative h-[calc(100vh-56px)] w-full">
      <MapView
        neighborhoods={neighborhoods}
        houses={houses}
        onHouseClick={house => setSelectedHouse(house)}
      />
      <HousePanel
        house={selectedHouse}
        userRole={userRole}
        onClose={() => setSelectedHouse(null)}
      />
    </div>
  )
}
