'use client'
import { useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/mapbox'
import type { ActivityPoint } from '@/lib/activity'

type Props = {
  points: ActivityPoint[]
  palette: Map<string, string>
  visible: boolean
}

export function ActivityLayer({ points, palette, visible }: Props) {
  const geojson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: points.map((p, i) => ({
      type: 'Feature',
      id: i,
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { color: palette.get(p.userId) ?? '#f59e0b' },
    })),
  }), [points, palette])

  return (
    <Source id="activity" type="geojson" data={geojson}>
      <Layer
        id="activity-dots"
        type="circle"
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{
          'circle-color': ['get', 'color'],
          'circle-radius': 5,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.85,
        }}
      />
    </Source>
  )
}
