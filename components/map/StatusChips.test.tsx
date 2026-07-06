import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { StatusChips } from './StatusChips'
import type { StatusOption } from '@/lib/statuses'

const STATUSES: StatusOption[] = [
  { id: 's1', name: 'Interested', color: '#eab308', sortOrder: 1, active: true, autoKey: 'interested' },
  { id: 's2', name: 'Customer', color: '#22c55e', sortOrder: 2, active: true, autoKey: 'customer' },
  { id: 's3', name: 'Old Status', color: '#8b5cf6', sortOrder: 3, active: false, autoKey: null },
]

describe('StatusChips', () => {
  it('renders active statuses as buttons, hides inactive ones', () => {
    render(<StatusChips statuses={STATUSES} value={null} onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Interested' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Customer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Old Status' })).not.toBeInTheDocument()
  })

  it('shows an inactive status if it is the current value', () => {
    render(<StatusChips statuses={STATUSES} value="s3" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Old Status' })).toBeInTheDocument()
  })

  it('marks the selected chip with aria-pressed', () => {
    render(<StatusChips statuses={STATUSES} value="s2" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Customer' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Interested' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('selecting an unselected chip calls onSelect with its id', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<StatusChips statuses={STATUSES} value={null} onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: 'Customer' }))
    expect(onSelect).toHaveBeenCalledWith('s2')
  })

  it('tapping the selected chip calls onSelect with null (clear)', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<StatusChips statuses={STATUSES} value="s2" onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: 'Customer' }))
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})
