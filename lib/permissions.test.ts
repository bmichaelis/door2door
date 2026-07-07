import { describe, it, expect } from 'vitest'
import { requireRole, canManageTeam, canSetDoNotKnock, canDeleteNote } from './permissions'

describe('permissions', () => {
  it('requireRole throws for wrong role', () => {
    expect(() => requireRole('rep', 'admin')).toThrow()
  })

  it('requireRole passes for correct role', () => {
    expect(() => requireRole('admin', 'admin')).not.toThrow()
  })

  it('admin can manage any team', () => {
    expect(canManageTeam({ role: 'admin', teamId: null }, 'any-team-id')).toBe(true)
  })

  it('manager can only manage their own team', () => {
    expect(canManageTeam({ role: 'manager', teamId: 'team-1' }, 'team-1')).toBe(true)
    expect(canManageTeam({ role: 'manager', teamId: 'team-1' }, 'team-2')).toBe(false)
  })

  it('only admin and manager can set do_not_knock', () => {
    expect(canSetDoNotKnock('admin')).toBe(true)
    expect(canSetDoNotKnock('manager')).toBe(true)
    expect(canSetDoNotKnock('rep')).toBe(false)
  })

  it('note author can delete their own note', () => {
    expect(canDeleteNote({ id: 'u1', role: 'rep' }, { userId: 'u1' })).toBe(true)
  })

  it('another rep cannot delete someone else\'s note', () => {
    expect(canDeleteNote({ id: 'u2', role: 'rep' }, { userId: 'u1' })).toBe(false)
  })

  it('manager and admin can delete any note', () => {
    expect(canDeleteNote({ id: 'u2', role: 'manager' }, { userId: 'u1' })).toBe(true)
    expect(canDeleteNote({ id: 'u2', role: 'admin' }, { userId: 'u1' })).toBe(true)
  })

  it('orphaned note (null author) is manager+ only', () => {
    expect(canDeleteNote({ id: 'u1', role: 'rep' }, { userId: null })).toBe(false)
    expect(canDeleteNote({ id: 'u1', role: 'manager' }, { userId: null })).toBe(true)
  })
})
