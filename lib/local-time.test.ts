import { describe, it, expect } from 'vitest'
import { normalizeLocal, addMinutesLocal } from './local-time'

describe('normalizeLocal', () => {
  it('appends seconds when missing', () => {
    expect(normalizeLocal('2026-07-10T14:30')).toBe('2026-07-10T14:30:00')
  })

  it('leaves full timestamps untouched', () => {
    expect(normalizeLocal('2026-07-10T14:30:45')).toBe('2026-07-10T14:30:45')
  })
})

describe('addMinutesLocal', () => {
  it('adds minutes within an hour', () => {
    expect(addMinutesLocal('2026-07-10T14:30:00', 60)).toBe('2026-07-10T15:30:00')
  })

  it('rolls over midnight', () => {
    expect(addMinutesLocal('2026-07-10T23:30:00', 60)).toBe('2026-07-11T00:30:00')
  })

  it('rolls over month ends', () => {
    expect(addMinutesLocal('2026-07-31T23:30:00', 60)).toBe('2026-08-01T00:30:00')
  })

  it('accepts input without seconds', () => {
    expect(addMinutesLocal('2026-07-10T14:30', 60)).toBe('2026-07-10T15:30:00')
  })
})
