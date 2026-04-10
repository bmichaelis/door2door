'use client'
import { useMemo } from 'react'
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
}

export function HousePins({ houses, onHouseClick }: Props) {
  // Neighborhood summary: one point per neighborhood with house count
  const summaryGeojson = useMemo<GeoJSON.FeatureCollection>(() => {
    const groups = new Map<string, { sumLat: number; sumLng: number; count: number }>()
    for (const h of houses) {
      if (!h.neighborhoodId) continue
      const g = groups.get(h.neighborhoodId) ?? { sumLat: 0, sumLng: 0, count: 0 }
      g.sumLat += h.lat
      g.sumLng += h.lng
      g.count++
      groups.set(h.neighborhoodId, g)
    }
    return {
      type: 'FeatureCollection',
      features: Array.from(groups.entries()).map(([id, g]) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [g.sumLng / g.count, g.sumLat / g.count] },
        properties: { id, count: g.count },
      })),
    }
  }, [houses])

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
    <>
      {/* Neighborhood summary bubbles — visible when zoomed out */}
      <Source id="neighborhood-summary" type="geojson" data={summaryGeojson}>
        <Layer
          id="neighborhood-bubbles"
          maxzoom={14}
          type="circle"
          paint={{
            'circle-color': '#6b7280',
            'circle-radius': [
              'interpolate', ['linear'], ['get', 'count'],
              100, 20,
              500, 30,
              2000, 42,
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.85,
          }}
        />
        <Layer
          id="neighborhood-counts"
          maxzoom={14}
          type="symbol"
          layout={{
            'text-field': ['get', 'count'],
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 13,
          }}
          paint={{ 'text-color': '#ffffff' }}
        />
      </Source>

      {/* Individual house pins — visible when zoomed in */}
      <Source id="houses" type="geojson" data={geojson}>
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
    </>
  )
}
