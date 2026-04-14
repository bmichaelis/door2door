'use client'
import { useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/mapbox'

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
}

type Props = {
  businesses: BusinessRow[]
}

export function BusinessPins({ businesses }: Props) {
  const geojson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: businesses.map(b => ({
      type: 'Feature',
      id: b.id,
      geometry: { type: 'Point', coordinates: [b.lng, b.lat] },
      properties: { id: b.id, name: b.name },
    })),
  }), [businesses])

  return (
    <Source id="businesses" type="geojson" data={geojson}>
      <Layer
        id="business-circles"
        minzoom={14}
        type="circle"
        paint={{
          'circle-color': '#f97316',
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        }}
      />
    </Source>
  )
}
