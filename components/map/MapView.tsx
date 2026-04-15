'use client'
import Map, { NavigationControl } from 'react-map-gl/mapbox'

import { MAPBOX_TOKEN } from '@/lib/mapbox'
import { NeighborhoodLayer } from './NeighborhoodLayer'
import { HousePins } from './HousePins'
import { BusinessPins, type BusinessRow } from './BusinessPins'
import { useState, useEffect } from 'react'
// mapStyle is now owned by MapShell so both toggles render outside the map
import type { HouseRow, Neighborhood } from '@/lib/db/schema'
import { MAP_STYLE_URLS, type MapStyle } from './MapStyleToggle'

export type LayerVisibility = { homes: boolean; businesses: boolean }

type Props = {
  neighborhoods: (Neighborhood & { boundary: GeoJSON.Polygon })[]
  houses: HouseRow[]
  businesses: BusinessRow[]
  layers: LayerVisibility
  mapStyle: MapStyle
  initialCenter?: { lat: number; lng: number }
  onHouseClick: (house: HouseRow) => void
  onBusinessClick?: (business: BusinessRow) => void
  onMapClick?: (lat: number, lng: number) => void
  onViewportChange?: (lat: number, lng: number) => void
}

export default function MapView({ neighborhoods, houses, businesses, layers, mapStyle, initialCenter, onHouseClick, onBusinessClick, onMapClick, onViewportChange }: Props) {
  const [viewport, setViewport] = useState({
    longitude: initialCenter?.lng ?? -98.5795,
    latitude: initialCenter?.lat ?? 39.8283,
    zoom: initialCenter ? 13 : 10,
  })

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      pos => setViewport(v => ({ ...v, longitude: pos.coords.longitude, latitude: pos.coords.latitude, zoom: 13 })),
      () => {}
    )
  }, [])

  return (
    <Map
      {...viewport}
      onMove={e => {
        setViewport(e.viewState)
        onViewportChange?.(e.viewState.latitude, e.viewState.longitude)
      }}
      mapboxAccessToken={MAPBOX_TOKEN}
      mapStyle={MAP_STYLE_URLS[mapStyle]}
      style={{ width: '100%', height: '100%' }}
      interactiveLayerIds={['house-circles', 'business-circles']}
      onClick={e => {
        const feature = e.features?.[0]
        if (feature?.layer?.id === 'house-circles') {
          const house = houses.find(h => h.id === feature.properties?.id)
          if (house) { onHouseClick(house); return }
        }
        if (feature?.layer?.id === 'business-circles') {
          const business = businesses.find(b => b.id === feature.properties?.id)
          if (business) { onBusinessClick?.(business); return }
        }
        if (viewport.zoom >= 15) onMapClick?.(e.lngLat.lat, e.lngLat.lng)
      }}
    >
      <NavigationControl position="top-right" />
      <NeighborhoodLayer neighborhoods={neighborhoods} />
      {layers.homes && <HousePins houses={houses} onHouseClick={onHouseClick} />}
      {layers.businesses && <BusinessPins businesses={businesses} />}
    </Map>
  )
}
