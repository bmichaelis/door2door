import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgendaList } from './AgendaList'
import type { AgendaRow } from '@/lib/appointments'

const NOW = new Date('2026-07-07T12:00:00')

const row = (over: Partial<AgendaRow>): AgendaRow => ({
  id: 'x',
  scheduledAt: '2026-07-07T15:00:00',
  notes: null,
  status: 'scheduled',
  repName: 'Brett',
  entity: 'house',
  label: '123 Main St',
  sublabel: 'Provo — Smith',
  lat: 0,
  lng: 0,
  ...over,
})

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
})
afterEach(() => vi.unstubAllGlobals())

describe('AgendaList', () => {
  it('renders group headings with rows', () => {
    render(<AgendaList initialRows={[
      row({ id: 'a', scheduledAt: '2026-07-07T09:00:00', label: 'Overdue House' }),
      row({ id: 'b', scheduledAt: '2026-07-07T15:00:00', label: 'Today House' }),
    ]} showRep={false} now={NOW} />)
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Overdue House')).toBeInTheDocument()
  })

  it('shows rep name only when showRep', () => {
    const { rerender } = render(<AgendaList initialRows={[row({})]} showRep={false} now={NOW} />)
    expect(screen.queryByText('Brett')).not.toBeInTheDocument()
    rerender(<AgendaList initialRows={[row({})]} showRep now={NOW} />)
    expect(screen.getByText('Brett')).toBeInTheDocument()
  })

  it('completing an appointment PATCHes and removes the row', async () => {
    const user = userEvent.setup()
    render(<AgendaList initialRows={[row({ id: 'a', label: 'Done House' })]} showRep={false} now={NOW} />)
    await user.click(screen.getByRole('button', { name: 'Complete' }))
    expect(fetch).toHaveBeenCalledWith('/api/appointments/a', expect.objectContaining({ method: 'PATCH' }))
    expect(screen.queryByText('Done House')).not.toBeInTheDocument()
  })

  it('restores the row when the PATCH fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    const user = userEvent.setup()
    render(<AgendaList initialRows={[row({ id: 'a', label: 'Sticky House' })]} showRep={false} now={NOW} />)
    await user.click(screen.getByRole('button', { name: 'Cancel appointment' }))
    expect(await screen.findByText('Sticky House')).toBeInTheDocument()
    expect(screen.getByText('Failed to update appointment. Please try again.')).toBeInTheDocument()
  })

  it('shows the empty state', () => {
    render(<AgendaList initialRows={[]} showRep={false} now={NOW} />)
    expect(screen.getByText('No upcoming appointments.')).toBeInTheDocument()
  })
})
