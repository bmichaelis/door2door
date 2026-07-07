import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TagEditor } from './TagEditor'

const TAGS = [
  { tagId: 't1', name: 'dog in yard' },
  { tagId: 't2', name: 'roof damage' },
]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ id: 't3', name: 'dog friendly' }, { id: 't1', name: 'dog in yard' }],
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TagEditor', () => {
  it('renders attached tags as chips', () => {
    render(<TagEditor tags={TAGS} onAttach={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('dog in yard')).toBeInTheDocument()
    expect(screen.getByText('roof damage')).toBeInTheDocument()
  })

  it('remove button calls onRemove with the tagId', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<TagEditor tags={TAGS} onAttach={vi.fn()} onRemove={onRemove} />)
    await user.click(screen.getByRole('button', { name: 'Remove roof damage' }))
    expect(onRemove).toHaveBeenCalledWith('t2')
  })

  it('typing shows suggestions, excluding already-attached tags', async () => {
    const user = userEvent.setup()
    render(<TagEditor tags={TAGS} onAttach={vi.fn()} onRemove={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Add tag' }))
    await user.type(screen.getByRole('textbox', { name: 'New tag' }), 'dog')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'dog friendly' })).toBeInTheDocument()
    })
    // t1 "dog in yard" is already attached — must not be suggested
    expect(screen.queryByRole('button', { name: 'dog in yard' })).not.toBeInTheDocument()
  })

  it('clicking a suggestion attaches it and clears the input', async () => {
    const user = userEvent.setup()
    const onAttach = vi.fn()
    render(<TagEditor tags={TAGS} onAttach={onAttach} onRemove={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Add tag' }))
    await user.type(screen.getByRole('textbox', { name: 'New tag' }), 'dog')
    await waitFor(() => screen.getByRole('button', { name: 'dog friendly' }))
    await user.click(screen.getByRole('button', { name: 'dog friendly' }))
    expect(onAttach).toHaveBeenCalledWith('dog friendly')
    expect(screen.getByRole('textbox', { name: 'New tag' })).toHaveValue('')
  })

  it('Enter attaches the typed name', async () => {
    const user = userEvent.setup()
    const onAttach = vi.fn()
    render(<TagEditor tags={TAGS} onAttach={onAttach} onRemove={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Add tag' }))
    await user.type(screen.getByRole('textbox', { name: 'New tag' }), 'solar panels{Enter}')
    expect(onAttach).toHaveBeenCalledWith('solar panels')
  })

  it('Enter with blank input does nothing', async () => {
    const user = userEvent.setup()
    const onAttach = vi.fn()
    render(<TagEditor tags={TAGS} onAttach={onAttach} onRemove={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Add tag' }))
    await user.type(screen.getByRole('textbox', { name: 'New tag' }), '   {Enter}')
    expect(onAttach).not.toHaveBeenCalled()
  })
})
