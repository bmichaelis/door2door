'use client'
import Map, { NavigationControl } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAPBOX_TOKEN } from '@/lib/mapbox'
import { NeighborhoodLayer } from './NeighborhoodLayer'
import { HousePins } from './HousePins'
import { useState, useEffect } from 'react'
import type { HouseRow, Neighborhood } from '@/lib/db/schema'
import MapStyleToggle, { MapStyle, MAP_STYLE_URLS } from './MapStyleToggle'

type Props = {
  neighborhoods: (Neighborhood & { boundary: GeoJSON.Polygon })[]
  houses: HouseRow[]
  onHouseClick: (house: HouseRow) => void
  onMapClick?: (lat: number, lng: number) => void
}

export default function MapView({ neighborhoods, houses, onHouseClick, onMapClick }: Props) {
  const [viewport, setViewport] = useState({
    longitude: -98.5795,
    latitude: 39.8283,
    zoom: 10,
  })
  const [mapStyle, setMapStyle] = useState<MapStyle>('streets')

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      pos => setViewport(v => ({ ...v, longitude: pos.coords.longitude, latitude: pos.coords.latitude, zoom: 13 })),
      () => {}
    )
  }, [])

  return (
    <Map
      {...viewport}
      onMove={e => setViewport(e.viewState)}
      mapboxAccessToken={MAPBOX_TOKEN}
      mapStyle={MAP_STYLE_URLS[mapStyle]}
      style={{ width: '100%', height: '100%' }}
      interactiveLayerIds={['house-circles']}
      onClick={e => {
        const feature = e.features?.[0]
        if (feature?.layer?.id === 'house-circles') {
          const house = houses.find(h => h.id === feature.properties?.id)
          if (house) { onHouseClick(house); return }
        }
        onMapClick?.(e.lngLat.lat, e.lngLat.lng)
      }}
    >
      <NavigationControl position="top-right" />
      <NeighborhoodLayer neighborhoods={neighborhoods} />
      <HousePins houses={houses} onHouseClick={onHouseClick} />
      <MapStyleToggle value={mapStyle} onChange={setMapStyle} />
    </Map>
  )
}
