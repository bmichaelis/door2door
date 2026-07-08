import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from '@/lib/db'
import { users, accounts, sessions, verificationTokens } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET || !process.env.AUTH_SECRET) {
  throw new Error('AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, and AUTH_SECRET are required')
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar.events',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  trustHost: true,
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id
      session.user.role = user.role ?? null
      session.user.teamId = user.teamId ?? null
      return session
    },
  },
  events: {
    // Database adapters only persist tokens on FIRST sign-in (linkAccount);
    // subsequent logins rotate tokens that would otherwise be lost. Persist
    // them ourselves — without this, re-consent never reaches the DB.
    async signIn({ account }) {
      if (account?.provider !== 'google') return
      const updates: Partial<typeof accounts.$inferInsert> = {
        access_token: account.access_token ?? null,
        expires_at: account.expires_at ?? null,
      }
      // Only update scope/refresh_token when present — a login response that
      // omits them must never wipe a previously granted value
      if (account.scope) updates.scope = account.scope
      if (account.refresh_token) updates.refresh_token = account.refresh_token
      await db.update(accounts).set(updates).where(
        and(eq(accounts.provider, 'google'), eq(accounts.providerAccountId, account.providerAccountId))
      )
    },
  },
})
