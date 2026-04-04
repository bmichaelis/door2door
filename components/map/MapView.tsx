'use client'
import Map, { NavigationControl } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAPBOX_TOKEN } from '@/lib/mapbox'
import { NeighborhoodLayer } from './NeighborhoodLayer'
import { HousePins } from './HousePins'
import { useState } from 'react'
import type { House, Neighborhood } from '@/lib/db/schema'

type Props = {
  neighborhoods: (Neighborhood & { boundary: GeoJSON.Polygon })[]
  houses: House[]
  onHouseClick: (house: House) => void
  onMapClick?: (lat: number, lng: number) => void
}

export default function MapView({ neighborhoods, houses, onHouseClick, onMapClick }: Props) {
  const [viewport, setViewport] = useState({
    longitude: -98.5795,
    latitude: 39.8283,
    zoom: 10,
  })

  return (
    <Map
      {...viewport}
      onMove={e => setViewport(e.viewState)}
      mapboxAccessToken={MAPBOX_TOKEN}
      mapStyle="mapbox://styles/mapbox/streets-v12"
      style={{ width: '100%', height: '100%' }}
      interactiveLayerIds={['house-circles']}
      onClick={e => {
        // If the click landed on a house pin, open the panel
        const feature = e.features?.[0]
        if (feature?.layer?.id === 'house-circles') {
          const house = houses.find(h => h.id === feature.properties?.id)
          if (house) { onHouseClick(house); return }
        }
        // Otherwise pass the coordinates to the parent (tap-to-add-house)
        onMapClick?.(e.lngLat.lat, e.lngLat.lng)
      }}
    >
      <NavigationControl position="top-right" />
      <NeighborhoodLayer neighborhoods={neighborhoods} />
      <HousePins houses={houses} onHouseClick={onHouseClick} />
    </Map>
  )
}
