import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { Leaderboard, rankRows } from './Leaderboard'
import type { LeaderboardRow } from '@/lib/stats'

const row = (over: Partial<LeaderboardRow>): LeaderboardRow => ({
  id: 'x',
  name: 'X',
  doors_week: '0',
  conversations_week: '0',
  sales_week: '0',
  doors_month: '0',
  conversations_month: '0',
  sales_month: '0',
  ...over,
})

const ROWS: LeaderboardRow[] = [
  row({ id: 'u1', name: 'Alice', doors_week: '10', sales_week: '1', doors_month: '20' }),
  row({ id: 'u2', name: 'Bob', doors_week: '12', doors_month: '15' }),
  row({ id: 'u3', name: 'Cara', doors_week: '10', sales_week: '2', doors_month: '40' }),
]

function dataRowNames() {
  const [, ...dataRows] = screen.getAllByRole('row')
  return dataRows.map(r => within(r).getAllByRole('cell')[1].textContent)
}

describe('rankRows', () => {
  it('ranks by doors desc for the given window', () => {
    const ranked = rankRows(ROWS, 'week')
    expect(ranked.map(r => r.name)).toEqual(['Bob', 'Cara', 'Alice'])
    expect(ranked.map(r => r.rank)).toEqual([1, 2, 3])
  })

  it('tie-breaks by sales desc (Cara over Alice at 10 doors)', () => {
    const ranked = rankRows(ROWS, 'week')
    expect(ranked[1].name).toBe('Cara')
  })

  it('tie-breaks by name asc when doors and sales tie', () => {
    const ranked = rankRows([
      row({ id: 'a', name: 'Zed', doors_week: '5' }),
      row({ id: 'b', name: 'Amy', doors_week: '5' }),
    ], 'week')
    expect(ranked.map(r => r.name)).toEqual(['Amy', 'Zed'])
  })

  it('sorts null names last within a tie', () => {
    const ranked = rankRows([
      row({ id: 'a', name: null, doors_week: '5' }),
      row({ id: 'b', name: 'Amy', doors_week: '5' }),
    ], 'week')
    expect(ranked[0].name).toBe('Amy')
  })

  it('uses month values for the month window', () => {
    expect(rankRows(ROWS, 'month').map(r => r.name)).toEqual(['Cara', 'Alice', 'Bob'])
  })

  it('treats non-numeric counts as 0', () => {
    const ranked = rankRows([
      row({ id: 'a', name: 'A', doors_week: 'oops' }),
      row({ id: 'b', name: 'B', doors_week: '1' }),
    ], 'week')
    expect(ranked[0].name).toBe('B')
  })
})

describe('Leaderboard', () => {
  it('renders reps ranked by weekly doors with medals for the top three', () => {
    render(<Leaderboard rows={ROWS} currentUserId="u1" />)
    expect(dataRowNames()[0]).toContain('Bob')
    expect(screen.getByText('🥇')).toBeInTheDocument()
    expect(screen.getByText('🥈')).toBeInTheDocument()
    expect(screen.getByText('🥉')).toBeInTheDocument()
  })

  it('highlights the current user with a you badge', () => {
    render(<Leaderboard rows={ROWS} currentUserId="u3" />)
    expect(screen.getByText('you')).toBeInTheDocument()
    const caraRow = screen.getByText('you').closest('tr')!
    expect(within(caraRow).getByText('Cara')).toBeInTheDocument()
  })

  it('switching to month re-ranks the table', async () => {
    const user = userEvent.setup()
    render(<Leaderboard rows={ROWS} currentUserId="u1" />)
    await user.click(screen.getByRole('button', { name: 'This Month' }))
    expect(dataRowNames()[0]).toContain('Cara')
  })

  it('shows the empty state when there are no rows', () => {
    render(<Leaderboard rows={[]} currentUserId="u1" />)
    expect(screen.getByText('No team members yet.')).toBeInTheDocument()
  })
})
