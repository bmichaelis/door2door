'use client'
import { Source, Layer } from 'react-map-gl'
import type { Neighborhood } from '@/lib/db/schema'

type Props = {
  neighborhoods: (Neighborhood & { boundary: GeoJSON.Polygon })[]
}

export function NeighborhoodLayer({ neighborhoods }: Props) {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: neighborhoods
      .filter(n => n.boundary)
      .map(n => ({
        type: 'Feature',
        id: n.id,
        geometry: n.boundary,
        properties: { name: n.name, id: n.id },
      })),
  }

  return (
    <Source id="neighborhoods" type="geojson" data={geojson}>
      <Layer
        id="neighborhood-fill"
        type="fill"
        paint={{ 'fill-color': '#3b82f6', 'fill-opacity': 0.1 }}
      />
      <Layer
        id="neighborhood-outline"
        type="line"
        paint={{ 'line-color': '#3b82f6', 'line-width': 2 }}
      />
    </Source>
  )
}
