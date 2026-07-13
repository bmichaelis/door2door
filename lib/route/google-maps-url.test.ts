import { describe, it, expect } from 'vitest'
import { buildGoogleMapsDirUrl } from '@/lib/route/google-maps-url'
import type { Stop } from '@/lib/route/geo'

const S = (id: string, lat: number, lng: number): Stop => ({ id, name: id, lat, lng })

describe('buildGoogleMapsDirUrl', () => {
  it('builds a directions URL: origin=start, destination=last, rest=waypoints in order', () => {
    const url = buildGoogleMapsDirUrl({ lat: 40.0, lng: -111.0 }, [S('a', 40.1, -111.1), S('b', 40.2, -111.2), S('c', 40.3, -111.3)])
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://www.google.com/maps/dir/')
    expect(u.searchParams.get('api')).toBe('1')
    expect(u.searchParams.get('origin')).toBe('40,-111')
    expect(u.searchParams.get('destination')).toBe('40.3,-111.3')
    expect(u.searchParams.get('waypoints')).toBe('40.1,-111.1|40.2,-111.2')
    expect(u.searchParams.get('travelmode')).toBe('driving')
  })
  it('omits waypoints when there is a single stop', () => {
    const u = new URL(buildGoogleMapsDirUrl({ lat: 1, lng: 2 }, [S('a', 3, 4)]))
    expect(u.searchParams.get('destination')).toBe('3,4')
    expect(u.searchParams.get('waypoints')).toBeNull()
  })
})
