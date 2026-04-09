import { describe, it, expect } from 'vitest'
import { formatAddress } from './houses'

describe('formatAddress', () => {
  it('formats a full address with unit', () => {
    const result = formatAddress({
      number: '376',
      street: 'S 800 East St',
      unit: '2B',
      city: 'Payson',
      region: 'UT',
      postcode: '84651',
    })
    expect(result).toBe('376 S 800 East St, Unit 2B, Payson, UT 84651')
  })

  it('formats an address without unit', () => {
    const result = formatAddress({
      number: '560',
      street: 'S 600 West St',
      unit: null,
      city: 'Payson',
      region: 'UT',
      postcode: '84651',
    })
    expect(result).toBe('560 S 600 West St, Payson, UT 84651')
  })

  it('formats an address with empty string unit the same as null unit', () => {
    const result = formatAddress({
      number: '560',
      street: 'S 600 West St',
      unit: '',
      city: 'Payson',
      region: 'UT',
      postcode: '84651',
    })
    expect(result).toBe('560 S 600 West St, Payson, UT 84651')
  })
})
