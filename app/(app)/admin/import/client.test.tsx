import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ImportClient } from './client'

afterEach(() => vi.restoreAllMocks())

describe('ImportClient', () => {
  it('renders a file input and a disabled upload button', () => {
    render(<ImportClient />)
    expect(screen.getByLabelText(/file/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled()
  })

  it('enables the upload button when a file is selected', async () => {
    const user = userEvent.setup()
    render(<ImportClient />)
    const file = new File(['{}'], 'addresses.geojson', { type: 'application/geo+json' })
    await user.upload(screen.getByLabelText(/file/i), file)
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled()
  })

  it('shows unsupported file type error for .txt files', async () => {
    const user = userEvent.setup()
    render(<ImportClient />)
    const file = new File(['test'], 'addresses.txt', { type: 'text/plain' })
    await user.upload(screen.getByLabelText(/file/i), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    expect(await screen.findByText(/unsupported file type/i)).toBeInTheDocument()
  })

  it('POSTs to the GeoJSON endpoint for .geojson files', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imported: 100, skipped: 2, total: 102 }),
    }))
    render(<ImportClient />)
    const file = new File(['{}'], 'addresses.geojson', { type: 'application/geo+json' })
    await user.upload(screen.getByLabelText(/file/i), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/houses/import/geojson',
        expect.any(Object)
      )
    )
  })

  it('POSTs to the CSV endpoint for .csv files', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imported: 50, total: 50 }),
    }))
    render(<ImportClient />)
    const file = new File(['addr1\naddr2'], 'addresses.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText(/file/i), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/houses/import',
        expect.any(Object)
      )
    )
  })

  it('shows result card with Imported, Skipped, and Total after GeoJSON upload', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imported: 12450, skipped: 3, total: 12453 }),
    }))
    render(<ImportClient />)
    const file = new File(['{}'], 'data.geojson', { type: 'application/geo+json' })
    await user.upload(screen.getByLabelText(/file/i), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    expect(await screen.findByText('12,450')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('12,453')).toBeInTheDocument()
    expect(screen.getByText(/imported/i)).toBeInTheDocument()
    expect(screen.getByText(/skipped/i)).toBeInTheDocument()
    expect(screen.getByText(/total/i)).toBeInTheDocument()
  })

  it('omits the Skipped row when response has no skipped field (CSV)', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imported: 50, total: 55 }),
    }))
    render(<ImportClient />)
    const file = new File(['addr'], 'data.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText(/file/i), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    await screen.findByRole('button', { name: 'Upload another file' })
    expect(screen.queryByText(/skipped/i)).not.toBeInTheDocument()
  })

  it('shows network error when fetch throws', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')))
    render(<ImportClient />)
    const file = new File(['{}'], 'data.geojson', { type: 'application/geo+json' })
    await user.upload(screen.getByLabelText(/file/i), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    expect(await screen.findByText(/network error/i)).toBeInTheDocument()
  })

  it('resets to idle and re-enables file input after clicking "Upload another file"', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imported: 10, total: 10 }),
    }))
    render(<ImportClient />)
    const file = new File(['addr'], 'data.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText(/file/i), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    await user.click(await screen.findByRole('button', { name: 'Upload another file' }))
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled()
  })
})
