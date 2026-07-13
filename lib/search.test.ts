import { describe, it, expect } from 'vitest'
import { sql } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { tokenPatterns, ilikeAllTokens } from './search'

const render = (frag: ReturnType<typeof ilikeAllTokens>) =>
  new PgDialect().sqlToQuery(frag)

describe('tokenPatterns', () => {
  it('wraps each whitespace-split token in %…%', () => {
    expect(tokenPatterns('2805 apache')).toEqual(['%2805%', '%apache%'])
  })
  it('collapses leading/trailing/repeated whitespace', () => {
    expect(tokenPatterns('  1060   450  north ')).toEqual(['%1060%', '%450%', '%north%'])
  })
  it('handles a single token', () => {
    expect(tokenPatterns('michaelis')).toEqual(['%michaelis%'])
  })
  it('returns [] for empty or whitespace-only input', () => {
    expect(tokenPatterns('')).toEqual([])
    expect(tokenPatterns('   ')).toEqual([])
  })
})

describe('ilikeAllTokens', () => {
  it('emits one ILIKE per token, AND-joined and parenthesized', () => {
    const { sql: text, params } = render(ilikeAllTokens(sql`col`, ['%a%', '%b%']))
    expect(params).toEqual(['%a%', '%b%'])
    expect((text.match(/ilike/gi) ?? []).length).toBe(2)
    expect(text.trim().startsWith('(')).toBe(true)
    expect(text.trim().endsWith(')')).toBe(true)
    expect(text.toLowerCase()).toContain(' and ')
  })
  it('handles a single token without an AND', () => {
    const { sql: text, params } = render(ilikeAllTokens(sql`col`, ['%a%']))
    expect(params).toEqual(['%a%'])
    expect((text.match(/ilike/gi) ?? []).length).toBe(1)
    expect(text.toLowerCase()).not.toContain(' and ')
  })
})
