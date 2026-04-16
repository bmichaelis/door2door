export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { households } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { eq, sql } from 'drizzle-orm'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const houseId = new URL(req.url).searchParams.get('houseId')
  if (!houseId) return NextResponse.json({ error: 'houseId required' }, { status: 400 })
  const rows = await db.select().from(households)
    .where(eq(households.houseId, houseId))
    .orderBy(sql`${households.active} DESC, ${households.createdAt} DESC`)
  return NextResponse.json(rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const body = await req.json()

  if (!body.houseId) return NextResponse.json({ error: 'houseId required' }, { status: 400 })

  await db.update(households)
    .set({ active: false })
    .where(eq(households.houseId, body.houseId))

  const [household] = await db.insert(households).values({
    houseId: body.houseId,
    surname: body.surname ?? null,
    headOfHouseholdName: body.headOfHouseholdName ?? null,
    spouseName: body.spouseName ?? null,
    active: true,
  }).returning()
  return NextResponse.json(household, { status: 201 })
})
