import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PendingSyncBadge } from './PendingSyncBadge'
import { useSync } from './SyncProvider'

// Render the badge under a fake provider value by mocking useSync
import { vi } from 'vitest'
vi.mock('./SyncProvider', async (orig) => ({ ...(await orig<typeof import('./SyncProvider')>()), useSync: vi.fn() }))

describe('PendingSyncBadge', () => {
  it('renders nothing when there is nothing pending', () => {
    ;(useSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ pending: 0, refresh: () => {} })
    const { container } = render(<PendingSyncBadge />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the pending count when nonzero', () => {
    ;(useSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ pending: 3, refresh: () => {} })
    render(<PendingSyncBadge />)
    expect(screen.getByText('3 pending')).toBeInTheDocument()
  })
})
