import { nearestNeighborOrder, type LatLng, type Stop } from '@/lib/route/geo'

export async function optimizeOrder(start: LatLng, stops: Stop[]): Promise<Stop[]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  try {
    if (!token) throw new Error('NEXT_PUBLIC_MAPBOX_TOKEN not set')
    const coords = [start, ...stops].map((p) => `${p.lng},${p.lat}`).join(';')
    const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coords}?source=first&destination=last&roundtrip=false&access_token=${token}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Mapbox Optimization ${res.status}`)
    const data = (await res.json()) as { code?: string; waypoints?: { waypoint_index: number }[] }
    if (data.code !== 'Ok' || !data.waypoints || data.waypoints.length !== stops.length + 1) {
      throw new Error('Unexpected Mapbox Optimization response')
    }
    // waypoints[0] = start; waypoints[i+1] corresponds to stops[i]
    return stops
      .map((s, i) => ({ s, idx: data.waypoints![i + 1].waypoint_index }))
      .sort((x, y) => x.idx - y.idx)
      .map((x) => x.s)
  } catch (e) {
    console.error('[route] optimizeOrder fell back to nearest-neighbor', e)
    return nearestNeighborOrder(start, stops)
  }
}
