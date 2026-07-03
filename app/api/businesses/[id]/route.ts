export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { businesses, statuses } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { eq, sql } from 'drizzle-orm'

export const PATCH = withErrorHandling(async (req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { id } = await params
  const body = await req.json()

  if (!('statusId' in body)) {
    return NextResponse.json({ error: 'statusId required' }, { status: 400 })
  }
  if (body.statusId !== null) {
    const [status] = await db.select().from(statuses).where(eq(statuses.id, body.statusId))
    if (!status || !status.active) {
      return NextResponse.json({ error: 'Unknown or inactive statusId' }, { status: 400 })
    }
  }

  await db.update(businesses).set({ statusId: body.statusId }).where(eq(businesses.id, id))

  const result = await db.execute(sql`
    SELECT businesses.id, businesses.name, businesses.type, businesses.category,
      businesses.number, businesses.street, businesses.city, businesses.region,
      businesses.postcode, businesses.phone, businesses.website,
      businesses.external_id as "externalId",
      ST_Y(businesses.location) as lat, ST_X(businesses.location) as lng,
      businesses.neighborhood_id as "neighborhoodId",
      businesses.status_id as "statusId",
      businesses.created_at as "createdAt"
    FROM businesses WHERE businesses.id = ${id}
  `)
  if (!result.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(result.rows[0])
})
