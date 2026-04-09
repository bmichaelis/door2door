export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

export type GeocodeResult = {
  lat: number
  lng: number
  number: string
  street: string
  city: string
  region: string
  postcode: string
}

function parseFeature(feature: Record<string, unknown>): GeocodeResult | null {
  if (!feature) return null
  const coords = (feature.geometry as { coordinates: number[] })?.coordinates
  if (!coords) return null

  const context = (feature.context as { id: string; text: string; short_code?: string }[]) ?? []
  const postcode = context.find(c => c.id.startsWith('postcode.'))?.text ?? ''
  const city = context.find(c => c.id.startsWith('place.'))?.text ?? ''
  const regionRaw = context.find(c => c.id.startsWith('region.'))?.short_code ?? ''
  const region = regionRaw.startsWith('US-') ? regionRaw.slice(3) : regionRaw

  return {
    lng: coords[0],
    lat: coords[1],
    number: (feature.address as string) ?? '',
    street: (feature.text as string) ?? '',
    city,
    region,
    postcode,
  }
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const feature = data.features?.[0]
  return parseFeature(feature)
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=address&access_token=${MAPBOX_TOKEN}&limit=1`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const feature = data.features?.[0]
  return parseFeature(feature)
}
