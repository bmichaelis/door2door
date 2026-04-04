import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'

export const GET = withErrorHandling(async () => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager')
  const rows = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    image: users.image,
    role: users.role,
    teamId: users.teamId,
    createdAt: users.createdAt,
  }).from(users).orderBy(users.name)
  return NextResponse.json(rows)
})
