import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { jsonRequest, params, dbMock } from '@/test/route-harness'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', async () => ({ db: (await import('@/test/route-harness')).dbMock }))

import { PATCH, DELETE } from './route'
import { auth } from '@/lib/auth'

const asAdmin = () => (auth as Mock).mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
const systemRow = { id: 's1', name: 'Sold', color: '#22c55e', sortOrder: 1, active: true, autoKey: 'customer' }
const customRow = { id: 's2', name: 'Custom', color: '#8b5cf6', sortOrder: 6, active: true, autoKey: null }

beforeEach(() => { dbMock.reset(); (auth as Mock).mockReset() })

describe('PATCH /api/statuses/[id]', () => {
  it('403 when the caller is not an admin', async () => {
    ;(auth as Mock).mockResolvedValue({ user: { id: 'r1', role: 'rep' } })
    const res = await PATCH(jsonRequest('PATCH', '/api/statuses/s1', { name: 'X' }), params({ id: 's1' }))
    expect(res.status).toBe(403)
  })

  it('404 when the row does not exist', async () => {
    asAdmin(); dbMock.configure({ select: [[]] })
    const res = await PATCH(jsonRequest('PATCH', '/api/statuses/none', { name: 'X' }), params({ id: 'none' }))
    expect(res.status).toBe(404)
  })

  it('400 when deactivating a system row via active:false', async () => {
    asAdmin(); dbMock.configure({ select: [[systemRow]] })
    const res = await PATCH(jsonRequest('PATCH', '/api/statuses/s1', { active: false }), params({ id: 's1' }))
    expect(res.status).toBe(400)
  })

  it('400 when deactivating a system row via the active:0 coercion', async () => {
    asAdmin(); dbMock.configure({ select: [[systemRow]] })
    const res = await PATCH(jsonRequest('PATCH', '/api/statuses/s1', { active: 0 }), params({ id: 's1' }))
    expect(res.status).toBe(400)
  })

  it('renames a system row (allowed)', async () => {
    asAdmin(); dbMock.configure({ select: [[systemRow]], update: [[{ ...systemRow, name: 'Sold!' }]] })
    const res = await PATCH(jsonRequest('PATCH', '/api/statuses/s1', { name: 'Sold!' }), params({ id: 's1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ name: 'Sold!' })
  })
})

describe('DELETE /api/statuses/[id]', () => {
  it('400 when deleting a system row', async () => {
    asAdmin(); dbMock.configure({ select: [[systemRow]] })
    const res = await DELETE(jsonRequest('DELETE', '/api/statuses/s1'), params({ id: 's1' }))
    expect(res.status).toBe(400)
  })

  it('204 when deleting a custom row', async () => {
    asAdmin(); dbMock.configure({ select: [[customRow]], delete: [undefined] })
    const res = await DELETE(jsonRequest('DELETE', '/api/statuses/s2'), params({ id: 's2' }))
    expect(res.status).toBe(204)
  })

  it('404 for an unknown row', async () => {
    asAdmin(); dbMock.configure({ select: [[]] })
    const res = await DELETE(jsonRequest('DELETE', '/api/statuses/none'), params({ id: 'none' }))
    expect(res.status).toBe(404)
  })
})
