import type { LatLng, Stop } from '@/lib/route/geo'

export function buildGoogleMapsDirUrl(start: LatLng, ordered: Stop[]): string {
  const pt = (p: LatLng) => `${p.lat},${p.lng}`
  const destination = ordered[ordered.length - 1]
  const waypoints = ordered.slice(0, -1).map(pt).join('|')
  const params = new URLSearchParams({
    api: '1',
    origin: pt(start),
    destination: pt(destination),
    travelmode: 'driving',
  })
  if (waypoints) params.set('waypoints', waypoints)
  return `https://www.google.com/maps/dir/?${params.toString()}`
}
