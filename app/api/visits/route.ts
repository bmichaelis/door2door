export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { visits } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { eq, desc, sql } from 'drizzle-orm'
import { visitAutoKey } from '@/lib/statuses'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const householdId = new URL(req.url).searchParams.get('householdId')
  if (!householdId) return NextResponse.json({ error: 'householdId required' }, { status: 400 })
  const rows = await db.select().from(visits)
    .where(eq(visits.householdId, householdId))
    .orderBy(desc(visits.createdAt))
  return NextResponse.json(rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const body = await req.json()

  if (!body.householdId) return NextResponse.json({ error: 'householdId required' }, { status: 400 })
  if (!body.contactStatus) return NextResponse.json({ error: 'contactStatus required' }, { status: 400 })

  const validContactStatuses = ['answered', 'not_home', 'refused']
  if (!validContactStatuses.includes(body.contactStatus)) {
    return NextResponse.json({ error: 'contactStatus must be answered, not_home, or refused' }, { status: 400 })
  }

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

  // Auto-set the house status from the visit outcome. Never fail the visit
  // insert over this — visit logging is the critical path.
  let houseStatusId: string | null = null
  try {
    const autoKey = visitAutoKey(body)
    if (autoKey) {
      await db.execute(sql`
        UPDATE houses SET status_id = s.id
        FROM statuses s
        WHERE s.auto_key = ${autoKey}
          AND houses.id = (SELECT house_id FROM households WHERE id = ${body.householdId})
      `)
    }
    const row = await db.execute(sql`
      SELECT h.status_id AS "statusId" FROM houses h
      JOIN households ho ON ho.house_id = h.id
      WHERE ho.id = ${body.householdId}
    `)
    houseStatusId = (row.rows[0]?.statusId as string | undefined) ?? null
  } catch (e) {
    console.error('status auto-set failed', e)
  }

  return NextResponse.json({ ...visit, houseStatusId }, { status: 201 })
})
