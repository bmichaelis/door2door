import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { teams } from '@/lib/db/schema'
import { assertRole } from '@/lib/permissions'
import { eq } from 'drizzle-orm'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  assertRole(session?.user?.role, 'admin')
  const { id } = await params
  const body = await req.json()
  const [team] = await db.update(teams)
    .set({ name: body.name, managerId: body.managerId })
    .where(eq(teams.id, id))
    .returning()
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(team)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  assertRole(session?.user?.role, 'admin')
  const { id } = await params
  await db.delete(teams).where(eq(teams.id, id))
  return new NextResponse(null, { status: 204 })
}
