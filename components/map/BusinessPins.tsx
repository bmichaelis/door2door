'use client'
import { useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/mapbox'
import { pinColor } from '@/lib/statuses'

export type BusinessRow = {
  id: string
  name: string
  type: string | null
  category: string | null
  lat: number
  lng: number
  number: string | null
  street: string | null
  city: string | null
  region: string | null
  postcode: string | null
  phone: string | null
  website: string | null
  statusId: string | null
}

const BUSINESS_FALLBACK_COLOR = '#f97316'

type Props = {
  businesses: BusinessRow[]
  statusColors: Record<string, string>
}

export function BusinessPins({ businesses, statusColors }: Props) {
  const geojson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: businesses.map(b => ({
      type: 'Feature',
      id: b.id,
      geometry: { type: 'Point', coordinates: [b.lng, b.lat] },
      properties: { id: b.id, name: b.name, color: pinColor(b, statusColors, BUSINESS_FALLBACK_COLOR) },
    })),
  }), [businesses, statusColors])

  return (
    <Source id="businesses" type="geojson" data={geojson}>
      <Layer
        id="business-circles"
        minzoom={14}
        type="circle"
        paint={{
          'circle-color': ['get', 'color'],
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        }}
      />
    </Source>
  )
}
