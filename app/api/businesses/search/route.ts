export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql } from 'drizzle-orm'
import { tokenPatterns, ilikeAllTokens } from '@/lib/search'

const BUSINESS_COLS = sql`
  businesses.id, businesses.name, businesses.type, businesses.category,
  businesses.number, businesses.street, businesses.city, businesses.region,
  businesses.postcode, businesses.phone, businesses.website,
  businesses.external_id as "externalId",
  ST_Y(businesses.location) as lat, ST_X(businesses.location) as lng,
  businesses.neighborhood_id as "neighborhoodId",
  businesses.status_id as "statusId",
  businesses.created_at as "createdAt"
`

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (!q) return NextResponse.json([])

  const patterns = tokenPatterns(q)

  // Two trgm-indexed searches UNION'd. Pattern matches the houses search route.
  const rows = await db.execute(sql`
    (
      SELECT ${BUSINESS_COLS}
      FROM businesses
      WHERE ${ilikeAllTokens(sql`businesses.name`, patterns)}
      ORDER BY businesses.name
      LIMIT 8
    )
    UNION
    (
      SELECT ${BUSINESS_COLS}
      FROM businesses
      WHERE ${ilikeAllTokens(
        sql`(COALESCE(businesses.number, '') || ' ' || COALESCE(businesses.street, ''))`,
        patterns,
      )}
      ORDER BY businesses.street, businesses.number
      LIMIT 8
    )
    ORDER BY name
    LIMIT 8
  `)

  return NextResponse.json(rows.rows)
})
