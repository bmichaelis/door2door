import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import MapStyleToggle, { MapStyle, MAP_STYLE_URLS } from './MapStyleToggle'

describe('MapStyleToggle', () => {
  it('renders three buttons with correct labels', () => {
    render(<MapStyleToggle value="streets" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Satellite' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hybrid' })).toBeInTheDocument()
  })

  it('marks the active style button as active', () => {
    render(<MapStyleToggle value="satellite" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Satellite' })).toHaveClass('bg-blue-600')
    expect(screen.getByRole('button', { name: 'Map' })).not.toHaveClass('bg-blue-600')
    expect(screen.getByRole('button', { name: 'Hybrid' })).not.toHaveClass('bg-blue-600')
  })

  it('calls onChange with the correct style key when a button is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MapStyleToggle value="streets" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Hybrid' }))
    expect(onChange).toHaveBeenCalledWith('hybrid')
  })

  it('MAP_STYLE_URLS contains valid mapbox style URLs for all three styles', () => {
    const styles: MapStyle[] = ['streets', 'satellite', 'hybrid']
    for (const style of styles) {
      expect(MAP_STYLE_URLS[style]).toMatch(/^mapbox:\/\/styles\/mapbox\//)
    }
  })
})
