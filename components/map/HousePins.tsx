'use client'
import { Source, Layer } from 'react-map-gl/mapbox'
import type { HouseRow } from '@/lib/db/schema'

function pinColor(house: HouseRow & { lastOutcome?: string | null }): string {
  if (house.doNotKnock || house.noSolicitingSign) return '#000000'
  switch (house.lastOutcome) {
    case 'sold': return '#22c55e'
    case 'interested': case 'maybe': return '#eab308'
    case 'not_interested': case 'refused': return '#ef4444'
    default: return '#9ca3af'
  }
}

type HouseWithOutcome = HouseRow & { lastOutcome?: string | null }

type Props = {
  houses: HouseWithOutcome[]
  onHouseClick: (house: HouseWithOutcome) => void
  selectedHouseId?: string | null
}

export function HousePins({ houses, selectedHouseId }: Props) {
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
        id="house-circle-highlight"
        minzoom={14}
        type="circle"
        filter={['==', ['get', 'id'], selectedHouseId ?? '']}
        paint={{
          'circle-color': 'rgba(0,0,0,0)',
          'circle-radius': 13,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#3b82f6',
          'circle-opacity': 0,
          'circle-stroke-opacity': 1,
        }}
      />
      <Layer
        id="house-circles"
        minzoom={14}
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
