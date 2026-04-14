import type { HouseRow } from '@/lib/db/schema'

export type HouseWithOutcome = HouseRow & { lastOutcome?: string | null }

/** Parse the leading integer from a house number like "123A" or "123-125". */
export function parseHouseNumber(num: string): number {
  const m = num.match(/^(\d+)/)
  return m ? parseInt(m[1], 10) : 0
}

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
