import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { visits } from '@/lib/db/schema'
import { assertRole } from '@/lib/permissions'
import { eq, desc } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const session = await auth()
  assertRole(session?.user?.role, 'admin', 'manager', 'rep')
  const householdId = new URL(req.url).searchParams.get('householdId')
  if (!householdId) return NextResponse.json({ error: 'householdId required' }, { status: 400 })
  const rows = await db.select().from(visits)
    .where(eq(visits.householdId, householdId))
    .orderBy(desc(visits.createdAt))
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  assertRole(session?.user?.role, 'admin', 'manager', 'rep')
  const body = await req.json()
  const [visit] = await db.insert(visits).values({
    householdId: body.householdId,
    userId: session!.user!.id,
    contactStatus: body.contactStatus,
    interestLevel: body.interestLevel ?? null,
    notes: body.notes ?? null,
    followUpAt: body.followUpAt ? new Date(body.followUpAt) : null,
    saleOutcome: body.saleOutcome ?? null,
    productId: body.productId ?? null,
    installDate: body.installDate ? new Date(body.installDate) : null,
    serviceDate: body.serviceDate ? new Date(body.serviceDate) : null,
  }).returning()
  return NextResponse.json(visit, { status: 201 })
}
