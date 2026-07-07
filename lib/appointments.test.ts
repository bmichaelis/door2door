import { describe, it, expect } from 'vitest'
import { groupAgenda, type AgendaRow } from './appointments'

const NOW = new Date('2026-07-07T12:00:00')

const row = (over: Partial<AgendaRow>): AgendaRow => ({
  id: 'x',
  scheduledAt: '2026-07-07T15:00:00',
  notes: null,
  status: 'scheduled',
  repName: null,
  entity: 'house',
  label: '123 Main St',
  sublabel: 'Provo — Smith',
  lat: 0,
  lng: 0,
  ...over,
})

describe('groupAgenda', () => {
  it('splits overdue (before now) into a leading Overdue group', () => {
    const groups = groupAgenda([
      row({ id: 'a', scheduledAt: '2026-07-07T09:00:00' }),
      row({ id: 'b', scheduledAt: '2026-07-07T15:00:00' }),
    ], NOW)
    expect(groups[0].heading).toBe('Overdue')
    expect(groups[0].rows.map(r => r.id)).toEqual(['a'])
    expect(groups[1].heading).toBe('Today')
    expect(groups[1].rows.map(r => r.id)).toEqual(['b'])
  })

  it('labels today, tomorrow, and later dates', () => {
    const groups = groupAgenda([
      row({ id: 'a', scheduledAt: '2026-07-07T15:00:00' }),
      row({ id: 'b', scheduledAt: '2026-07-08T09:00:00' }),
      row({ id: 'c', scheduledAt: '2026-07-10T09:00:00' }),
    ], NOW)
    expect(groups.map(g => g.heading)).toEqual(['Today', 'Tomorrow', 'Fri, Jul 10'])
  })

  it('sorts rows by time inside each group and groups ascending', () => {
    const groups = groupAgenda([
      row({ id: 'late', scheduledAt: '2026-07-08T16:00:00' }),
      row({ id: 'early', scheduledAt: '2026-07-08T08:00:00' }),
    ], NOW)
    expect(groups[0].rows.map(r => r.id)).toEqual(['early', 'late'])
  })

  it('omits the Overdue group when nothing is overdue', () => {
    const groups = groupAgenda([row({ scheduledAt: '2026-07-07T15:00:00' })], NOW)
    expect(groups[0].heading).toBe('Today')
  })

  it('returns empty array for no rows', () => {
    expect(groupAgenda([], NOW)).toEqual([])
  })
})
