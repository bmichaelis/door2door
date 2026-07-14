import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { jsonRequest, params, dbMock } from '@/test/route-harness'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', async () => ({ db: (await import('@/test/route-harness')).dbMock }))

import { GET } from './route'
import { auth } from '@/lib/auth'

beforeEach(() => { dbMock.reset(); (auth as Mock).mockReset() })

describe('GET /api/neighborhoods', () => {
  it('returns the executed rows for an authenticated rep', async () => {
    ;(auth as Mock).mockResolvedValue({ user: { id: 'r1', role: 'rep', teamId: 't1' } })
    dbMock.configure({ execute: [{ rows: [{ id: 'n1', houseCount: 0 }] }] })
    const res = await GET(jsonRequest('GET', '/api/neighborhoods?includeEmpty=1'), params({}))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: 'n1', houseCount: 0 }])
  })

  it('403 when there is no session', async () => {
    ;(auth as Mock).mockResolvedValue(null)
    const res = await GET(jsonRequest('GET', '/api/neighborhoods'), params({}))
    expect(res.status).toBe(403)
  })
})
