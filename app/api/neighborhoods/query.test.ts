import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { neighborhoodsListQuery } from './query'

const render = (includeEmpty: boolean) =>
  new PgDialect().sqlToQuery(neighborhoodsListQuery(includeEmpty)).sql.toLowerCase()

describe('neighborhoodsListQuery', () => {
  it('filters zero-house neighborhoods by default (HAVING present)', () => {
    expect(render(false)).toContain('having')
  })

  it('omits the HAVING when includeEmpty is true', () => {
    expect(render(true)).not.toContain('having')
  })

  it('keeps the same columns and grouping in both modes', () => {
    for (const mode of [false, true]) {
      const q = render(mode)
      expect(q).toContain('"housecount"')
      expect(q).toContain('group by n.id')
      expect(q).toContain('order by n.name')
    }
  })

  it('no longer selects the unused assignedUserName / users join', () => {
    for (const mode of [false, true]) {
      const q = render(mode)
      expect(q).not.toContain('assignedusername')
      expect(q).not.toContain('join users')
    }
  })
})
