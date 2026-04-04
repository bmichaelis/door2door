import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { households } from '@/lib/db/schema'
import { assertRole } from '@/lib/permissions'
import { eq, sql } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const session = await auth()
  assertRole(session?.user?.role, 'admin', 'manager', 'rep')
  const houseId = new URL(req.url).searchParams.get('houseId')
  if (!houseId) return NextResponse.json({ error: 'houseId required' }, { status: 400 })
  const rows = await db.select().from(households)
    .where(eq(households.houseId, houseId))
    .orderBy(sql`${households.active} DESC, ${households.createdAt} DESC`)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  assertRole(session?.user?.role, 'admin', 'manager', 'rep')
  const body = await req.json()

  await db.update(households)
    .set({ active: false })
    .where(eq(households.houseId, body.houseId))

  const [household] = await db.insert(households).values({
    houseId: body.houseId,
    surname: body.surname ?? null,
    headOfHouseholdName: body.headOfHouseholdName ?? null,
    active: true,
  }).returning()
  return NextResponse.json(household, { status: 201 })
}
