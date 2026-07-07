import { describe, it, expect } from 'vitest'
import { photoUrl } from './photos'

describe('photoUrl', () => {
  it('builds house photo URLs', () => {
    expect(photoUrl('house', 'abc-123')).toBe('/api/house-photos/abc-123')
  })

  it('builds business photo URLs', () => {
    expect(photoUrl('business', 'x')).toBe('/api/business-photos/x')
  })
})
