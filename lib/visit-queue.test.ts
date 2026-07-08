import { describe, it, expect, beforeEach } from 'vitest'
import { enqueueVisit, listQueuedVisits, removeQueuedVisit, queuedVisitCount } from './visit-queue'

// fake-indexeddb persists across tests in a run; clear the store each time
beforeEach(async () => {
  for (const v of await listQueuedVisits()) await removeQueuedVisit(v.id)
})

describe('visit-queue', () => {
  it('enqueues and lists a visit', async () => {
    const q = await enqueueVisit('/api/visits', { householdId: 'h1', contactStatus: 'answered' })
    expect(q.id).toBeTruthy()
    expect(q.endpoint).toBe('/api/visits')
    const all = await listQueuedVisits()
    expect(all).toHaveLength(1)
    expect(all[0].payload).toEqual({ householdId: 'h1', contactStatus: 'answered' })
  })

  it('counts queued visits', async () => {
    await enqueueVisit('/api/visits', { a: 1 })
    await enqueueVisit('/api/business-visits', { b: 2 })
    expect(await queuedVisitCount()).toBe(2)
  })

  it('removes a queued visit by id', async () => {
    const q = await enqueueVisit('/api/visits', { a: 1 })
    await removeQueuedVisit(q.id)
    expect(await queuedVisitCount()).toBe(0)
  })
})
