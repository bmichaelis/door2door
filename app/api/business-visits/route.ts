export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { businessVisits } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { eq, desc, sql } from 'drizzle-orm'
import { visitAutoKey } from '@/lib/statuses'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { searchParams } = new URL(req.url)
  const businessId = searchParams.get('businessId')
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 })

  const visits = await db
    .select()
    .from(businessVisits)
    .where(eq(businessVisits.businessId, businessId))
    .orderBy(desc(businessVisits.createdAt))
    .limit(20)

  return NextResponse.json(visits)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const userId = session!.user!.id!

  const body = await req.json()
  const { businessId, contactStatus, interestLevel, notes, followUpAt, saleOutcome, productId } = body

  if (!businessId || !contactStatus) {
    return NextResponse.json({ error: 'businessId and contactStatus required' }, { status: 400 })
  }

  const [visit] = await db.insert(businessVisits).values({
    businessId,
    userId,
    contactStatus,
    interestLevel: interestLevel ?? null,
    notes: notes ?? null,
    followUpAt: followUpAt ? new Date(followUpAt) : null,
    saleOutcome: saleOutcome ?? null,
    productId: productId ?? null,
  }).returning()

  let businessStatusId: string | null = null
  try {
    const autoKey = visitAutoKey(body)
    if (autoKey) {
      await db.execute(sql`
        UPDATE businesses SET status_id = s.id
        FROM statuses s
        WHERE s.auto_key = ${autoKey} AND businesses.id = ${businessId}
      `)
    }
    const row = await db.execute(sql`
      SELECT status_id AS "statusId" FROM businesses WHERE id = ${businessId}
    `)
    businessStatusId = (row.rows[0]?.statusId as string | undefined) ?? null
  } catch (e) {
    console.error('status auto-set failed', e)
  }

  return NextResponse.json({ ...visit, businessStatusId })
})
