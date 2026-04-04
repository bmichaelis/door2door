import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { assertRole } from '@/lib/permissions'
import { eq } from 'drizzle-orm'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  assertRole(session?.user?.role, 'admin')
  const { id } = await params
  const body = await req.json()
  const [user] = await db.update(users)
    .set({ role: body.role, teamId: body.teamId })
    .where(eq(users.id, id))
    .returning()
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(user)
}
