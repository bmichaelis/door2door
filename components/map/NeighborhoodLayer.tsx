'use client'
import { Source, Layer } from 'react-map-gl/mapbox'
import type { Neighborhood } from '@/lib/db/schema'

type Props = {
  neighborhoods: (Neighborhood & { boundary: GeoJSON.Polygon; houseCount: number })[]
  currentUserId: string
}

export function NeighborhoodLayer({ neighborhoods, currentUserId }: Props) {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: neighborhoods
      .filter(n => n.boundary)
      .map(n => ({
        type: 'Feature',
        id: n.id,
        geometry: n.boundary,
        properties: {
          name: n.name,
          id: n.id,
          houseCount: n.houseCount ?? 0,
          assignedUserId: n.assignedUserId ?? '',
          territoryStatus: n.territoryStatus ?? '',
        },
      })),
  }

  const mineActive = ['all', ['==', ['get', 'assignedUserId'], currentUserId], ['==', ['get', 'territoryStatus'], 'active']]
  const mineUpcoming = ['all', ['==', ['get', 'assignedUserId'], currentUserId], ['==', ['get', 'territoryStatus'], 'upcoming']]
  const completed = ['==', ['get', 'territoryStatus'], 'completed']

  return (
    <Source id="neighborhoods" type="geojson" data={geojson}>
      <Layer
        id="neighborhood-fill"
        type="fill"
        paint={{
          'fill-color': ['case', mineActive, '#3b82f6', mineUpcoming, '#8b5cf6', completed, '#9ca3af', '#3b82f6'] as never,
          'fill-opacity': ['case', mineActive, 0.25, mineUpcoming, 0.18, completed, 0.05, 0.1] as never,
        }}
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
