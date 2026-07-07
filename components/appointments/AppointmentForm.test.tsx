import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { AppointmentForm } from './AppointmentForm'

describe('AppointmentForm', () => {
  it('submits scheduledAt and trimmed notes', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<AppointmentForm onSubmit={onSubmit} onCancel={vi.fn()} />)
    await user.type(screen.getByLabelText('Date and time'), '2026-07-10T14:30')
    await user.type(screen.getByLabelText('Notes'), '  bring ladder  ')
    await user.click(screen.getByRole('button', { name: 'Book' }))
    expect(onSubmit).toHaveBeenCalledWith({ scheduledAt: '2026-07-10T14:30', notes: 'bring ladder' })
  })

  it('omits notes when blank', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<AppointmentForm onSubmit={onSubmit} onCancel={vi.fn()} />)
    await user.type(screen.getByLabelText('Date and time'), '2026-07-10T14:30')
    await user.click(screen.getByRole('button', { name: 'Book' }))
    expect(onSubmit).toHaveBeenCalledWith({ scheduledAt: '2026-07-10T14:30', notes: undefined })
  })

  it('Book is disabled until a date-time is entered', async () => {
    const user = userEvent.setup()
    render(<AppointmentForm onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Book' })).toBeDisabled()
    await user.type(screen.getByLabelText('Date and time'), '2026-07-10T14:30')
    expect(screen.getByRole('button', { name: 'Book' })).toBeEnabled()
  })

  it('Cancel fires onCancel', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<AppointmentForm onSubmit={vi.fn()} onCancel={onCancel} />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
