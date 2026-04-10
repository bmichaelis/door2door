'use client'
import { useRef, useCallback } from 'react'
import Map, { MapRef } from 'react-map-gl/mapbox'
import MapboxDraw from '@mapbox/mapbox-gl-draw'

type Props = {
  onDrawComplete: (polygon: GeoJSON.Polygon) => void
}

export function DrawMap({ onDrawComplete }: Props) {
  const mapRef = useRef<MapRef>(null)

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
    })

    map.addControl(draw, 'top-right')

    map.on('draw.create', (e: any) => {
      const polygon = e.features[0]?.geometry as GeoJSON.Polygon
      if (polygon) onDrawComplete(polygon)
    })
    map.on('draw.update', (e: any) => {
      const polygon = e.features[0]?.geometry as GeoJSON.Polygon
      if (polygon) onDrawComplete(polygon)
    })
  }, [onDrawComplete])

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={{ longitude: -111.693, latitude: 40.297, zoom: 12 }}
      mapStyle="mapbox://styles/mapbox/streets-v12"
      style={{ width: '100%', height: '100%' }}
      onLoad={handleLoad}
    />
  )
}
