'use client'
import { useEffect, useRef } from 'react'
import { useMap } from 'react-map-gl/mapbox'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'

type Props = {
  onDrawComplete: (polygon: GeoJSON.Polygon) => void
}

export function DrawControl({ onDrawComplete }: Props) {
  const { current: map } = useMap()
  const drawRef = useRef<MapboxDraw | null>(null)

  useEffect(() => {
    if (!map) return
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
    })
    map.addControl(draw)
    drawRef.current = draw

    const handleCreate = (e: any) => {
      const polygon = e.features[0]?.geometry as GeoJSON.Polygon
      if (polygon) onDrawComplete(polygon)
    }
    const handleUpdate = (e: any) => {
      const polygon = e.features[0]?.geometry as GeoJSON.Polygon
      if (polygon) onDrawComplete(polygon)
    }
    map.on('draw.create', handleCreate)
    map.on('draw.update', handleUpdate)

    return () => {
      map.off('draw.create', handleCreate)
      map.off('draw.update', handleUpdate)
      map.removeControl(draw)
    }
  }, [map])

  return null
}
