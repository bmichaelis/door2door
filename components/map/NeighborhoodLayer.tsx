'use client'
import { Source, Layer } from 'react-map-gl/mapbox'
import type { Neighborhood } from '@/lib/db/schema'

type Props = {
  neighborhoods: (Neighborhood & { boundary: GeoJSON.Polygon; houseCount: number })[]
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
        properties: { name: n.name, id: n.id, houseCount: n.houseCount ?? 0 },
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
      <Layer
        id="neighborhood-labels"
        maxzoom={14}
        type="symbol"
        layout={{
          'text-field': ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'houseCount']], ' homes'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
          'text-anchor': 'center',
        }}
        paint={{
          'text-color': '#1e40af',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        }}
      />
    </Source>
  )
}
