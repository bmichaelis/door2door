import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { jsonRequest, params, dbMock } from '@/test/route-harness'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', async () => ({ db: (await import('@/test/route-harness')).dbMock }))

import { PATCH } from './route'
import { auth } from '@/lib/auth'

beforeEach(() => { dbMock.reset(); (auth as Mock).mockReset() })

describe('PATCH /api/neighborhoods/[id]', () => {
  it('403 when the caller is a rep', async () => {
    ;(auth as Mock).mockResolvedValue({ user: { id: 'r1', role: 'rep', teamId: 't1' } })
    const res = await PATCH(jsonRequest('PATCH', '/api/neighborhoods/n1', { territoryStatus: 'active' }), params({ id: 'n1' }))
    expect(res.status).toBe(403)
  })

  it('404 when the neighborhood does not exist', async () => {
    ;(auth as Mock).mockResolvedValue({ user: { id: 'a1', role: 'admin', teamId: null } })
    dbMock.configure({ select: [[]] })
    const res = await PATCH(jsonRequest('PATCH', '/api/neighborhoods/none', { territoryStatus: 'active' }), params({ id: 'none' }))
    expect(res.status).toBe(404)
  })

  it('403 when a manager sends an admin-only field', async () => {
    ;(auth as Mock).mockResolvedValue({ user: { id: 'm1', role: 'manager', teamId: 't1' } })
    dbMock.configure({ select: [[{ teamId: 't1' }]] })
    const res = await PATCH(jsonRequest('PATCH', '/api/neighborhoods/n1', { name: 'Renamed' }), params({ id: 'n1' }))
    expect(res.status).toBe(403)
  })

  it('400 when assignedUserId points at a non-rep', async () => {
    ;(auth as Mock).mockResolvedValue({ user: { id: 'a1', role: 'admin', teamId: null } })
    // 1st select: the neighborhood row; 2nd select: the assignee lookup (a manager, not a rep)
    dbMock.configure({ select: [[{ teamId: 't1' }], [{ role: 'manager', teamId: 't1' }]] })
    const res = await PATCH(
      jsonRequest('PATCH', '/api/neighborhoods/n1', { assignedUserId: '11111111-1111-1111-1111-111111111111' }),
      params({ id: 'n1' }),
    )
    expect(res.status).toBe(400)
  })
})
