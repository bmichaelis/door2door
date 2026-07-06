import { describe, it, expect } from 'vitest'
import { visitAutoKey, pinColor, isValidHexColor, DEFAULT_PIN_COLOR } from './statuses'

describe('visitAutoKey', () => {
  it('maps sold to customer', () => {
    expect(visitAutoKey({ contactStatus: 'answered', saleOutcome: 'sold' })).toBe('customer')
  })

  it('sold wins over everything else', () => {
    expect(visitAutoKey({
      contactStatus: 'answered', saleOutcome: 'sold',
      interestLevel: 'not_interested', followUpAt: '2026-07-10T10:00',
    })).toBe('customer')
  })

  it('maps follow_up outcome to callback', () => {
    expect(visitAutoKey({ contactStatus: 'answered', saleOutcome: 'follow_up' })).toBe('callback')
  })

  it('maps a set followUpAt to callback even without outcome', () => {
    expect(visitAutoKey({ contactStatus: 'answered', followUpAt: '2026-07-10T10:00' })).toBe('callback')
  })

  it('callback wins over not_interested signals', () => {
    expect(visitAutoKey({
      contactStatus: 'answered', saleOutcome: 'follow_up', interestLevel: 'not_interested',
    })).toBe('callback')
  })

  it('maps refused to not_interested', () => {
    expect(visitAutoKey({ contactStatus: 'refused' })).toBe('not_interested')
  })

  it('maps not_interested interest to not_interested', () => {
    expect(visitAutoKey({ contactStatus: 'answered', interestLevel: 'not_interested' })).toBe('not_interested')
  })

  it('maps not_sold outcome to not_interested', () => {
    expect(visitAutoKey({ contactStatus: 'answered', saleOutcome: 'not_sold' })).toBe('not_interested')
  })

  it('maps interested and maybe to interested', () => {
    expect(visitAutoKey({ contactStatus: 'answered', interestLevel: 'interested' })).toBe('interested')
    expect(visitAutoKey({ contactStatus: 'answered', interestLevel: 'maybe' })).toBe('interested')
  })

  it('maps not_home to not_home', () => {
    expect(visitAutoKey({ contactStatus: 'not_home' })).toBe('not_home')
  })

  it('returns null for answered with no signals', () => {
    expect(visitAutoKey({ contactStatus: 'answered' })).toBeNull()
  })
})

describe('pinColor', () => {
  const colors = { 'id-1': '#22c55e' }

  it('flags always win', () => {
    expect(pinColor({ doNotKnock: true, statusId: 'id-1' }, colors)).toBe('#000000')
    expect(pinColor({ noSolicitingSign: true, statusId: 'id-1' }, colors)).toBe('#000000')
  })

  it('uses the status color when known', () => {
    expect(pinColor({ statusId: 'id-1' }, colors)).toBe('#22c55e')
  })

  it('falls back to default for null or unknown statusId', () => {
    expect(pinColor({ statusId: null }, colors)).toBe(DEFAULT_PIN_COLOR)
    expect(pinColor({ statusId: 'missing' }, colors)).toBe(DEFAULT_PIN_COLOR)
  })

  it('respects a custom fallback', () => {
    expect(pinColor({ statusId: null }, colors, '#f97316')).toBe('#f97316')
  })
})

describe('isValidHexColor', () => {
  it('accepts 6-digit hex', () => {
    expect(isValidHexColor('#22c55e')).toBe(true)
    expect(isValidHexColor('#ABCDEF')).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isValidHexColor('22c55e')).toBe(false)
    expect(isValidHexColor('#fff')).toBe(false)
    expect(isValidHexColor('#22c55e00')).toBe(false)
    expect(isValidHexColor('red')).toBe(false)
  })
})
