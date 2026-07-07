import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TerritoriesClient, repOptionsFor, type UserRow } from './client'

const USERS: UserRow[] = [
  { id: 'r1', name: 'Rita Rep', role: 'rep', teamId: 't1' },
  { id: 'r2', name: 'Ray Rep', role: 'rep', teamId: 't2' },
  { id: 'm1', name: 'Mo Manager', role: 'manager', teamId: 't1' },
]

const NEIGHBORHOODS = [
  { id: 'n1', name: 'Provo 01', team_id: 't1', teamId: 't1', houseCount: 120, assignedUserId: null, territoryStatus: null, assignedUserName: null },
  { id: 'n2', name: 'Provo 02', team_id: 't2', teamId: 't2', houseCount: 80, assignedUserId: 'r2', territoryStatus: 'active', assignedUserName: 'Ray Rep' },
]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') return Promise.resolve({ ok: true, json: async () => ({}) })
    if (url === '/api/users') return Promise.resolve({ ok: true, json: async () => USERS })
    return Promise.resolve({ ok: true, json: async () => NEIGHBORHOODS })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('repOptionsFor', () => {
  it('managers see only reps on the neighborhood team', () => {
    expect(repOptionsFor({ teamId: 't1' }, USERS, 'manager').map(u => u.id)).toEqual(['r1'])
  })

  it('admins see all reps', () => {
    expect(repOptionsFor({ teamId: 't1' }, USERS, 'admin').map(u => u.id)).toEqual(['r1', 'r2'])
  })

  it('non-reps are never options', () => {
    expect(repOptionsFor({ teamId: 't1' }, USERS, 'admin').some(u => u.id === 'm1')).toBe(false)
  })
})

describe('TerritoriesClient', () => {
  it('admin sees all neighborhoods', async () => {
    render(<TerritoriesClient currentUser={{ id: 'a1', role: 'admin', teamId: null }} />)
    expect(await screen.findByText('Provo 01')).toBeInTheDocument()
    expect(screen.getByText('Provo 02')).toBeInTheDocument()
  })

  it('manager sees only their team', async () => {
    render(<TerritoriesClient currentUser={{ id: 'm1', role: 'manager', teamId: 't1' }} />)
    expect(await screen.findByText('Provo 01')).toBeInTheDocument()
    expect(screen.queryByText('Provo 02')).not.toBeInTheDocument()
  })

  it('changing the assignee PATCHes the neighborhood', async () => {
    const user = userEvent.setup()
    render(<TerritoriesClient currentUser={{ id: 'a1', role: 'admin', teamId: null }} />)
    await screen.findByText('Provo 01')
    await user.selectOptions(screen.getByLabelText('Assignee for Provo 01'), 'r1')
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/neighborhoods/n1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ assignedUserId: 'r1' }),
      }))
    })
  })

  it('changing the status PATCHes the neighborhood', async () => {
    const user = userEvent.setup()
    render(<TerritoriesClient currentUser={{ id: 'a1', role: 'admin', teamId: null }} />)
    await screen.findByText('Provo 01')
    await user.selectOptions(screen.getByLabelText('Status for Provo 01'), 'active')
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/neighborhoods/n1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ territoryStatus: 'active' }),
      }))
    })
  })

  it('shows an error banner when a PATCH fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return Promise.resolve({ ok: false, json: async () => ({ error: 'Forbidden' }) })
      if (url === '/api/users') return Promise.resolve({ ok: true, json: async () => USERS })
      return Promise.resolve({ ok: true, json: async () => NEIGHBORHOODS })
    }))
    const user = userEvent.setup()
    render(<TerritoriesClient currentUser={{ id: 'a1', role: 'admin', teamId: null }} />)
    await screen.findByText('Provo 01')
    await user.selectOptions(screen.getByLabelText('Status for Provo 01'), 'active')
    expect(await screen.findByText('Forbidden')).toBeInTheDocument()
  })

  it('shows the empty state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url === '/api/users') return Promise.resolve({ ok: true, json: async () => USERS })
      return Promise.resolve({ ok: true, json: async () => [] })
    }))
    render(<TerritoriesClient currentUser={{ id: 'a1', role: 'admin', teamId: null }} />)
    expect(await screen.findByText('No neighborhoods yet.')).toBeInTheDocument()
  })
})
