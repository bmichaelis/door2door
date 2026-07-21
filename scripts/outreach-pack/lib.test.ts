import { describe, expect, test } from 'vitest'
import { ownerType, toCsv, UTAH_BBOX } from './lib.js'

describe('toCsv', () => {
  test('emits header + rows in the given column order', () => {
    const out = toCsv(['a', 'b'], [{ a: '1', b: '2' }, { a: '3', b: '4' }])
    expect(out).toBe('a,b\n1,2\n3,4\n')
  })
  test('quotes fields with comma/quote/newline and doubles inner quotes', () => {
    const out = toCsv(['x'], [{ x: 'a,b' }, { x: 'he said "hi"' }, { x: 'line1\nline2' }])
    expect(out).toBe('x\n"a,b"\n"he said ""hi"""\n"line1\nline2"\n')
  })
  test('renders null/undefined as empty and numbers as text', () => {
    expect(toCsv(['x', 'y'], [{ x: null, y: 5 }])).toBe('x,y\n,5\n')
  })
})

describe('ownerType', () => {
  test('person when a first name is present, entity otherwise', () => {
    expect(ownerType('Brett')).toBe('person')
    expect(ownerType(null)).toBe('entity')
    expect(ownerType('')).toBe('entity')
  })
})

test('UTAH_BBOX matches the config bounding box', () => {
  expect(UTAH_BBOX).toEqual({ w: -112.10, s: 39.77, e: -111.30, n: 40.45 })
})
