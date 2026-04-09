import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { houses } from '@/lib/db/schema'
import { requireRole, canSetDoNotKnock } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { eq, sql } from 'drizzle-orm'

export const PATCH = withErrorHandling(async (req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { id } = await params
  const body = await req.json()
  const role = session!.user!.role

  const updates: Partial<typeof houses.$inferInsert> = {}
  if (body.noSolicitingSign !== undefined) updates.noSolicitingSign = body.noSolicitingSign
  if (body.doNotKnock !== undefined) {
    if (!canSetDoNotKnock(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    updates.doNotKnock = body.doNotKnock
  }

  await db.update(houses).set(updates).where(eq(houses.id, id))

  const result = await db.execute(
    sql`SELECT
      houses.id, houses.number, houses.street, houses.unit,
      houses.city, houses.region, houses.postcode,
      houses.external_id as "externalId",
      ST_Y(houses.location) as lat, ST_X(houses.location) as lng,
      houses.neighborhood_id as "neighborhoodId",
      houses.do_not_knock as "doNotKnock",
      houses.no_soliciting_sign as "noSolicitingSign",
      houses.created_at as "createdAt"
      FROM houses WHERE houses.id = ${id}`
  )
  if (!result.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(result.rows[0])
})
