'use client'
import { useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/mapbox'
import type { HouseRow } from '@/lib/db/schema'
import { pinColor } from '@/lib/statuses'

type Props = {
  houses: HouseRow[]
  statusColors: Record<string, string>
  onHouseClick: (house: HouseRow) => void
  selectedHouseId?: string | null
}

export function HousePins({ houses, statusColors, selectedHouseId }: Props) {
  const geojson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: houses.map(h => ({
      type: 'Feature',
      id: h.id,
      geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
      properties: {
        id: h.id,
        color: pinColor(h, statusColors),
        flagged: h.doNotKnock || h.noSolicitingSign,
      },
    })),
  }), [houses, statusColors])

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
