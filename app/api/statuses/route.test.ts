import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { jsonRequest, params, dbMock } from '@/test/route-harness'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', async () => ({ db: (await import('@/test/route-harness')).dbMock }))

import { POST } from './route'
import { auth } from '@/lib/auth'

beforeEach(() => { dbMock.reset(); (auth as Mock).mockReset() })

describe('POST /api/statuses', () => {
  it('403 for a rep (admin-only)', async () => {
    ;(auth as Mock).mockResolvedValue({ user: { id: 'r1', role: 'rep' } })
    const res = await POST(jsonRequest('POST', '/api/statuses', { name: 'New', color: '#111111' }), params({}))
    expect(res.status).toBe(403)
  })

  it('400 when name is missing (admin)', async () => {
    ;(auth as Mock).mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    const res = await POST(jsonRequest('POST', '/api/statuses', { color: '#111111' }), params({}))
    expect(res.status).toBe(400)
  })
})
