import { describe, it, expect } from 'vitest'
import { normalizeTagName } from './tags'

describe('normalizeTagName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeTagName('  dog in yard  ')).toBe('dog in yard')
  })

  it('collapses internal whitespace', () => {
    expect(normalizeTagName('dog   in\tyard')).toBe('dog in yard')
  })

  it('returns empty string for blank input', () => {
    expect(normalizeTagName('   ')).toBe('')
    expect(normalizeTagName('')).toBe('')
  })

  it('preserves casing', () => {
    expect(normalizeTagName('Roof Damage')).toBe('Roof Damage')
  })
})
