import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { role: 'rep', teamId: 't1' } }) }))
// optimizeOrder returns a deterministic order so we can assert the URL is built from it
vi.mock('@/lib/route/optimize', () => ({ optimizeOrder: vi.fn(async (_s, stops) => [...stops].reverse()) }))

const CTX = { params: Promise.resolve({}) }
const post = (body: unknown) =>
  new NextRequest('http://x/api/route/optimize', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

beforeEach(() => vi.clearAllMocks())

describe('POST /api/route/optimize', () => {
  it('returns ordered stops + a Google Maps URL', async () => {
    const { POST } = await import('@/app/api/route/optimize/route')
    const res = await POST(post({ start: { lat: 40, lng: -111 }, stops: [
      { id: 'a', name: 'A', lat: 40.1, lng: -111.1 },
      { id: 'b', name: 'B', lat: 40.2, lng: -111.2 },
    ] }), CTX)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.orderedStops.map((s: { id: string }) => s.id)).toEqual(['b', 'a']) // reversed by the mock
    expect(json.googleMapsUrl).toContain('https://www.google.com/maps/dir/')
    expect(json.googleMapsUrl).toContain('destination=40.1%2C-111.1') // last after reverse = 'a'
  })

  it('rejects fewer than 2 stops with 400', async () => {
    const { POST } = await import('@/app/api/route/optimize/route')
    const res = await POST(post({ start: { lat: 0, lng: 0 }, stops: [{ id: 'a', name: 'A', lat: 1, lng: 1 }] }), CTX)
    expect(res.status).toBe(400)
  })

  it('rejects more than 10 stops with 400', async () => {
    const stops = Array.from({ length: 11 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, lat: i, lng: i }))
    const { POST } = await import('@/app/api/route/optimize/route')
    const res = await POST(post({ start: { lat: 0, lng: 0 }, stops }), CTX)
    expect(res.status).toBe(400)
  })
})
