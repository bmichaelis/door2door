import { describe, it, expect } from 'vitest'
import { haversineMeters, nearestNeighborOrder, nearestN, type Stop } from '@/lib/route/geo'

const S = (id: string, lat: number, lng: number): Stop => ({ id, name: id, lat, lng })

describe('haversineMeters', () => {
  it('is ~0 for the same point', () => {
    expect(haversineMeters({ lat: 40, lng: -111 }, { lat: 40, lng: -111 })).toBeLessThan(1)
  })
  it('~111km per degree of latitude', () => {
    const d = haversineMeters({ lat: 40, lng: -111 }, { lat: 41, lng: -111 })
    expect(d).toBeGreaterThan(110000)
    expect(d).toBeLessThan(112000)
  })
})

describe('nearestNeighborOrder', () => {
  it('orders by greedy nearest hop from start', () => {
    const start = { lat: 0, lng: 0 }
    const stops = [S('far', 0, 3), S('near', 0, 1), S('mid', 0, 2)]
    expect(nearestNeighborOrder(start, stops).map(s => s.id)).toEqual(['near', 'mid', 'far'])
  })
  it('does not mutate the input array', () => {
    const stops = [S('a', 0, 2), S('b', 0, 1)]
    nearestNeighborOrder({ lat: 0, lng: 0 }, stops)
    expect(stops.map(s => s.id)).toEqual(['a', 'b'])
  })
})

describe('nearestN', () => {
  it('returns the n closest to start', () => {
    const start = { lat: 0, lng: 0 }
    const stops = [S('c', 0, 3), S('a', 0, 1), S('b', 0, 2)]
    expect(nearestN(start, stops, 2).map(s => s.id)).toEqual(['a', 'b'])
  })
})
