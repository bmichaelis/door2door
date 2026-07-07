import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PhotoSection } from './PhotoSection'

vi.mock('@/lib/photos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/photos')>()
  return { ...actual, downscaleImage: vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' })) }
})

const PHOTOS = [
  { id: 'p1', userId: 'u1', createdAt: '2026-07-07T10:00:00Z', authorName: 'Brett' },
  { id: 'p2', userId: 'u2', createdAt: '2026-07-06T10:00:00Z', authorName: 'Alice' },
]

function mockFetch(routes: Record<string, unknown> = {}) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return Promise.resolve({ ok: true, json: async () => ({ id: 'new-1' }) })
    if (init?.method === 'DELETE') return Promise.resolve({ ok: true, json: async () => ({}) })
    return Promise.resolve({ ok: true, json: async () => routes[url] ?? PHOTOS })
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch())
})
afterEach(() => vi.unstubAllGlobals())

const USER_REP_U1 = { id: 'u1', role: 'rep' }

describe('PhotoSection', () => {
  it('renders fetched photos as thumbnails', async () => {
    render(<PhotoSection entity="house" entityId="h1" currentUser={USER_REP_U1} />)
    expect(await screen.findByAltText('Photo by Brett')).toHaveAttribute('src', '/api/house-photos/p1')
    expect(screen.getByAltText('Photo by Alice')).toBeInTheDocument()
  })

  it('uploading a file POSTs and prepends the new photo', async () => {
    const user = userEvent.setup()
    render(<PhotoSection entity="house" entityId="h1" currentUser={USER_REP_U1} />)
    await screen.findByAltText('Photo by Brett')
    const file = new File(['raw'], 'door.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText('Photo file'), file)
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/house-photos?houseId=h1', expect.objectContaining({ method: 'POST' }))
    })
    expect(await screen.findByAltText('Photo by You')).toBeInTheDocument()
  })

  it('rep sees delete only on their own photo', async () => {
    render(<PhotoSection entity="house" entityId="h1" currentUser={USER_REP_U1} />)
    await screen.findByAltText('Photo by Brett')
    expect(screen.getByRole('button', { name: 'Delete photo by Brett' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete photo by Alice' })).not.toBeInTheDocument()
  })

  it('manager sees delete on all photos', async () => {
    render(<PhotoSection entity="house" entityId="h1" currentUser={{ id: 'u9', role: 'manager' }} />)
    await screen.findByAltText('Photo by Brett')
    expect(screen.getByRole('button', { name: 'Delete photo by Alice' })).toBeInTheDocument()
  })

  it('failed delete restores the photo and shows an error', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return Promise.resolve({ ok: false, json: async () => ({}) })
      return Promise.resolve({ ok: true, json: async () => PHOTOS })
    }))
    render(<PhotoSection entity="house" entityId="h1" currentUser={USER_REP_U1} />)
    await screen.findByAltText('Photo by Brett')
    await user.click(screen.getByRole('button', { name: 'Delete photo by Brett' }))
    expect(await screen.findByAltText('Photo by Brett')).toBeInTheDocument()
    expect(screen.getByText('Failed to delete photo. Please try again.')).toBeInTheDocument()
  })

  it('shows an error banner when the list fails to load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    render(<PhotoSection entity="house" entityId="h1" currentUser={USER_REP_U1} />)
    expect(await screen.findByText('Failed to load photos.')).toBeInTheDocument()
  })
})
