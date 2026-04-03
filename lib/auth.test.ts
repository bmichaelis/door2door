import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock next-auth and its dependencies to avoid ESM resolution issues
// in the vitest/jsdom environment (next-auth uses next/server internally)
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
  })),
}))

vi.mock('@auth/drizzle-adapter', () => ({
  DrizzleAdapter: vi.fn(() => ({})),
}))

vi.mock('@/lib/db', () => ({
  db: {},
}))

vi.mock('@/lib/db/schema', () => ({
  users: {},
  accounts: {},
  sessions: {},
  verificationTokens: {},
}))

describe('auth config', () => {
  it('exports handlers, signIn, signOut, auth', async () => {
    const mod = await import('./auth')
    expect(mod.handlers).toBeDefined()
    expect(mod.signIn).toBeDefined()
    expect(mod.signOut).toBeDefined()
    expect(mod.auth).toBeDefined()
  })
})
