import { describe, it, expect, vi, afterEach } from 'vitest'

// Set token before importing module
process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'test-token'

import { geocodeAddress, reverseGeocode } from './mapbox'

const mockFeature = {
  address: '376',
  text: 'S 800 East St',
  geometry: { coordinates: [-111.7197941, 40.0389676] },
  context: [
    { id: 'postcode.abc', text: '84651' },
    { id: 'place.abc', text: 'Payson' },
    { id: 'region.abc', text: 'Utah', short_code: 'US-UT' },
  ],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('geocodeAddress', () => {
  it('returns structured fields from Mapbox response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [mockFeature] }),
    }))

    const result = await geocodeAddress('376 S 800 East St, Payson, UT 84651')

    expect(result).toEqual({
      lat: 40.0389676,
      lng: -111.7197941,
      number: '376',
      street: 'S 800 East St',
      city: 'Payson',
      region: 'UT',
      postcode: '84651',
    })
  })

  it('returns null when Mapbox returns no features', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    }))

    const result = await geocodeAddress('nonexistent address')
    expect(result).toBeNull()
  })

  it('returns null when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    const result = await geocodeAddress('any address')
    expect(result).toBeNull()
  })
})

describe('reverseGeocode', () => {
  it('returns structured fields from coordinates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [mockFeature] }),
    }))

    const result = await reverseGeocode(40.0389676, -111.7197941)

    expect(result).toEqual({
      lat: 40.0389676,
      lng: -111.7197941,
      number: '376',
      street: 'S 800 East St',
      city: 'Payson',
      region: 'UT',
      postcode: '84651',
    })
  })

  it('returns null when no features found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    }))

    const result = await reverseGeocode(0, 0)
    expect(result).toBeNull()
  })
})
