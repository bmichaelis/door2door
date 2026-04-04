'use client'
import { Source, Layer } from 'react-map-gl'
import type { House } from '@/lib/db/schema'

// Color logic based on last visit outcome stored on house (denormalized for map performance)
// Colors: grey=unvisited, green=sold, yellow=interested/maybe, red=refused, black=flagged
function pinColor(house: House & { lastOutcome?: string | null }): string {
  if (house.doNotKnock || house.noSolicitingSign) return '#000000'
  switch (house.lastOutcome) {
    case 'sold': return '#22c55e'
    case 'interested': case 'maybe': return '#eab308'
    case 'not_interested': case 'refused': return '#ef4444'
    default: return '#9ca3af'
  }
}

type HouseWithOutcome = House & { lastOutcome?: string | null }

type Props = {
  houses: HouseWithOutcome[]
  onHouseClick: (house: HouseWithOutcome) => void
}

export function HousePins({ houses, onHouseClick }: Props) {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: houses.map(h => ({
      type: 'Feature',
      id: h.id,
      geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
      properties: {
        id: h.id,
        color: pinColor(h),
        flagged: h.doNotKnock || h.noSolicitingSign,
      },
    })),
  }

  return (
    <Source id="houses" type="geojson" data={geojson}>
      <Layer
        id="house-circles"
        type="circle"
        paint={{
          'circle-color': ['get', 'color'],
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        }}
      />
    </Source>
  )
}
