import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Stop } from '@/lib/route/geo'

const S = (id: string, lat: number, lng: number): Stop => ({ id, name: id, lat, lng })
const START = { lat: 0, lng: 0 }
const STOPS = [S('a', 0, 1), S('b', 0, 2), S('c', 0, 3)]

beforeEach(() => vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', 'pk.test'))
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('optimizeOrder', () => {
  it('reorders stops by Mapbox waypoint_index (start is waypoints[0])', async () => {
    // trip order: start(0) -> c(1) -> a(2) -> b(3); waypoints align to input order [start,a,b,c]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'Ok', waypoints: [
        { waypoint_index: 0 }, // start
        { waypoint_index: 2 }, // a
        { waypoint_index: 3 }, // b
        { waypoint_index: 1 }, // c
      ] }),
    }))
    const { optimizeOrder } = await import('@/lib/route/optimize')
    expect((await optimizeOrder(START, STOPS)).map(s => s.id)).toEqual(['c', 'a', 'b'])
  })

  it('falls back to nearest-neighbor when Mapbox errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }))
    const { optimizeOrder } = await import('@/lib/route/optimize')
    // nearest-neighbor from start(0,0): a(0,1) -> b(0,2) -> c(0,3)
    expect((await optimizeOrder(START, STOPS)).map(s => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('falls back when fetch rejects (network)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const { optimizeOrder } = await import('@/lib/route/optimize')
    expect((await optimizeOrder(START, STOPS)).map(s => s.id)).toEqual(['a', 'b', 'c'])
  })
})
