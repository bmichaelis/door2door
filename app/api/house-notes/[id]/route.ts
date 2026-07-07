export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { houseNotes } from '@/lib/db/schema'
import { requireRole, canDeleteNote } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { eq } from 'drizzle-orm'

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { id } = await params

  const [note] = await db.select().from(houseNotes).where(eq(houseNotes.id, id))
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canDeleteNote({ id: session!.user!.id!, role: session!.user!.role }, note)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.delete(houseNotes).where(eq(houseNotes.id, id))
  return new NextResponse(null, { status: 204 })
})
