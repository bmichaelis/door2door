import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { NotesSection } from './NotesSection'

const NOTES = [
  { id: 'n1', body: 'gate code 1234', userId: 'u1', createdAt: '2026-07-05T10:00:00Z', authorName: 'Brett' },
  { id: 'n2', body: 'big dog, friendly', userId: 'u2', createdAt: '2026-07-04T10:00:00Z', authorName: 'Alice' },
]

describe('NotesSection', () => {
  it('renders notes with author names', () => {
    render(<NotesSection notes={NOTES} currentUser={{ id: 'u1', role: 'rep' }} onAdd={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('gate code 1234')).toBeInTheDocument()
    expect(screen.getByText(/Brett/)).toBeInTheDocument()
    expect(screen.getByText(/Alice/)).toBeInTheDocument()
  })

  it('shows empty state when there are no notes', () => {
    render(<NotesSection notes={[]} currentUser={{ id: 'u1', role: 'rep' }} onAdd={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('No notes yet.')).toBeInTheDocument()
  })

  it('rep sees delete only on their own note', () => {
    render(<NotesSection notes={NOTES} currentUser={{ id: 'u1', role: 'rep' }} onAdd={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Delete note by Brett' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete note by Alice' })).not.toBeInTheDocument()
  })

  it('manager sees delete on every note', () => {
    render(<NotesSection notes={NOTES} currentUser={{ id: 'u9', role: 'manager' }} onAdd={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Delete note by Brett' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete note by Alice' })).toBeInTheDocument()
  })

  it('delete calls onDelete with the note id', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(<NotesSection notes={NOTES} currentUser={{ id: 'u1', role: 'rep' }} onAdd={vi.fn()} onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: 'Delete note by Brett' }))
    expect(onDelete).toHaveBeenCalledWith('n1')
  })

  it('adding a note submits trimmed body and clears the field', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<NotesSection notes={[]} currentUser={{ id: 'u1', role: 'rep' }} onAdd={onAdd} onDelete={vi.fn()} />)
    const box = screen.getByPlaceholderText('Add a note about this property…')
    await user.type(box, '  new gate code 9999  ')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledWith('new gate code 9999')
    expect(box).toHaveValue('')
  })

  it('Add is disabled for blank input and while busy', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <NotesSection notes={[]} currentUser={{ id: 'u1', role: 'rep' }} onAdd={vi.fn()} onDelete={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    await user.type(screen.getByPlaceholderText('Add a note about this property…'), 'hi')
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled()
    rerender(
      <NotesSection notes={[]} currentUser={{ id: 'u1', role: 'rep' }} onAdd={vi.fn()} onDelete={vi.fn()} busy />
    )
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })
})
