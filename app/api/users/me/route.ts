export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { withErrorHandling } from '@/lib/api'

export const GET = withErrorHandling(async () => {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [user] = await db
    .select({ lastLat: users.lastLat, lastLng: users.lastLng })
    .from(users)
    .where(eq(users.id, session.user.id))

  return NextResponse.json(user ?? {})
})

export const PATCH = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lastLat, lastLng } = await req.json()
  if (typeof lastLat !== 'number' || typeof lastLng !== 'number') {
    return NextResponse.json({ error: 'lastLat and lastLng must be numbers' }, { status: 400 })
  }

  await db
    .update(users)
    .set({ lastLat, lastLng })
    .where(eq(users.id, session.user.id))

  return NextResponse.json({ ok: true })
})
