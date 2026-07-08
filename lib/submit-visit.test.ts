import { describe, it, expect, vi, beforeEach } from 'vitest'
import { submitVisit } from './submit-visit'
import * as queue from './visit-queue'

beforeEach(() => vi.restoreAllMocks())

describe('submitVisit', () => {
  it('returns the data and does not queue when the POST succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'v1' }) }))
    const enqueue = vi.spyOn(queue, 'enqueueVisit')
    const res = await submitVisit('/api/visits', { householdId: 'h1' })
    expect(res).toEqual({ ok: true, data: { id: 'v1' } })
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('queues the visit when the fetch throws (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const enqueue = vi.spyOn(queue, 'enqueueVisit').mockResolvedValue({ id: 'q1', endpoint: '/api/visits', payload: {}, createdAt: 0 })
    const res = await submitVisit('/api/visits', { householdId: 'h1' })
    expect(res).toEqual({ ok: true, queued: true })
    expect(enqueue).toHaveBeenCalledWith('/api/visits', { householdId: 'h1' })
  })

  it('reports failure and does NOT queue on a server rejection (!res.ok)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    const enqueue = vi.spyOn(queue, 'enqueueVisit')
    const res = await submitVisit('/api/visits', { householdId: 'h1' })
    expect(res).toEqual({ ok: false })
    expect(enqueue).not.toHaveBeenCalled()
  })
})
