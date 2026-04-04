type Role = 'admin' | 'manager' | 'rep'

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export function requireRole(userRole: Role | null | undefined, ...allowed: Role[]): void {
  if (!userRole || !allowed.includes(userRole)) {
    throw new ForbiddenError(`Forbidden: requires ${allowed.join(' or ')}`)
  }
}

export function canManageTeam(user: { role: Role | null; teamId: string | null }, teamId: string): boolean {
  if (user.role === 'admin') return true
  if (user.role === 'manager') return user.teamId === teamId
  return false
}

export function canSetDoNotKnock(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'manager'
}

export function isAdmin(role: Role | null | undefined): boolean {
  return role === 'admin'
}
