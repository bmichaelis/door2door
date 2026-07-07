import { describe, it, expect } from 'vitest'
import { repPalette, ACTIVITY_COLORS, type ActivityPoint } from './activity'

const pt = (userId: string): ActivityPoint => ({ userId, repName: userId, lat: 0, lng: 0, at: '2026-07-07T10:00:00' })

describe('repPalette', () => {
  it('assigns colors by sorted user id, stable across input order', () => {
    const a = repPalette([pt('b'), pt('a')])
    const b = repPalette([pt('a'), pt('b'), pt('a')])
    expect(a.get('a')).toBe(ACTIVITY_COLORS[0])
    expect(a.get('b')).toBe(ACTIVITY_COLORS[1])
    expect(b.get('a')).toBe(a.get('a'))
    expect(b.get('b')).toBe(a.get('b'))
  })

  it('cycles the palette past its length', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `u${String(i).padStart(2, '0')}`)
    const palette = repPalette(ids.map(pt))
    expect(palette.get('u08')).toBe(ACTIVITY_COLORS[0])
    expect(palette.get('u09')).toBe(ACTIVITY_COLORS[1])
  })

  it('returns an empty map for no points', () => {
    expect(repPalette([]).size).toBe(0)
  })
})
