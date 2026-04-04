import { describe, it, expect } from 'vitest'
import { requireRole, canManageTeam, canSetDoNotKnock } from './permissions'

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
})
