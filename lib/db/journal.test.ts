import { describe, it, expect } from 'vitest'
import {
  readJournal,
  findWhenOrderViolations,
  GRANDFATHERED_IDX,
  type JournalEntry,
} from './journal'

// @vitest-environment node

describe('migration journal when-ordering', () => {
  it('the real journal has no violations (given grandfathered entries)', () => {
    const violations = findWhenOrderViolations(readJournal(), GRANDFATHERED_IDX)
    expect(violations).toEqual([])
  })

  it('flags a backdated entry when nothing is grandfathered', () => {
    const entries: JournalEntry[] = [
      { idx: 0, when: 1000, tag: '0000_a' },
      { idx: 1, when: 2000, tag: '0001_b' },
      { idx: 2, when: 1500, tag: '0002_backdated' },
    ]
    const violations = findWhenOrderViolations(entries)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({
      idx: 2,
      tag: '0002_backdated',
      when: 1500,
      prevTag: '0001_b',
      prevWhen: 2000,
    })
  })

  it('still flags a new backdated entry even though idx 2 and 7 are grandfathered', () => {
    const entries = readJournal()
    const last = entries[entries.length - 1]
    const withBadNew: JournalEntry[] = [
      ...entries,
      { idx: 15, when: last.when - 1, tag: '0015_backdated' },
    ]
    const violations = findWhenOrderViolations(withBadNew, GRANDFATHERED_IDX)
    expect(violations).toHaveLength(1)
    expect(violations[0].idx).toBe(15)
  })
})
