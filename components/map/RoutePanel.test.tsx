import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import RoutePanel from './RoutePanel'
import type { Stop } from '@/lib/route/geo'

const S = (id: string): Stop => ({ id, name: `Name ${id}`, lat: 0, lng: 0 })
const base = {
  stops: [S('a'), S('b')], ordered: false, hasStart: true, planning: false,
  error: null as string | null, googleMapsUrl: null as string | null,
  onUseMyLocation: vi.fn(), onAddressSubmit: vi.fn(), onRemoveStop: vi.fn(),
  onPlan: vi.fn(), onClear: vi.fn(), onClose: vi.fn(),
}

describe('RoutePanel', () => {
  it('disables Plan route with fewer than 2 stops', () => {
    render(<RoutePanel {...base} stops={[S('a')]} />)
    expect(screen.getByRole('button', { name: /plan route/i })).toBeDisabled()
  })
  it('disables Plan route when there is no start', () => {
    render(<RoutePanel {...base} hasStart={false} />)
    expect(screen.getByRole('button', { name: /plan route/i })).toBeDisabled()
  })
  it('calls onPlan when Plan route is clicked', async () => {
    const onPlan = vi.fn()
    render(<RoutePanel {...base} onPlan={onPlan} />)
    await userEvent.click(screen.getByRole('button', { name: /plan route/i }))
    expect(onPlan).toHaveBeenCalled()
  })
  it('shows the Open in Google Maps link once a URL is present', () => {
    render(<RoutePanel {...base} ordered googleMapsUrl="https://www.google.com/maps/dir/?api=1" />)
    const link = screen.getByRole('link', { name: /open in google maps/i })
    expect(link).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1')
  })
})
