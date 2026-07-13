export type LatLng = { lat: number; lng: number }
export type Stop = { id: string; name: string; lat: number; lng: number }

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function nearestNeighborOrder(start: LatLng, stops: Stop[]): Stop[] {
  const remaining = [...stops]
  const ordered: Stop[] = []
  let cur: LatLng = start
  while (remaining.length) {
    let bestI = 0
    let bestD = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMeters(cur, remaining[i])
      if (d < bestD) {
        bestD = d
        bestI = i
      }
    }
    const [next] = remaining.splice(bestI, 1)
    ordered.push(next)
    cur = next
  }
  return ordered
}

export function nearestN(start: LatLng, stops: Stop[], n: number): Stop[] {
  return [...stops]
    .sort((a, b) => haversineMeters(start, a) - haversineMeters(start, b))
    .slice(0, n)
}
