export function formatAddress(house: {
  number: string
  street: string
  unit: string | null | undefined
  city: string
  region: string
  postcode: string
}): string {
  const line1 = `${house.number} ${house.street}`
  const line2 = house.unit ? `Unit ${house.unit}` : null
  const line3 = `${house.city}, ${house.region} ${house.postcode}`
  return [line1, line2, line3].filter(Boolean).join(', ')
}
