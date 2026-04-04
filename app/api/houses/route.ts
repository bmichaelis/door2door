import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { houses } from '@/lib/db/schema'
import { assertRole } from '@/lib/permissions'
import { sql } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const session = await auth()
  assertRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { searchParams } = new URL(req.url)
  const neighborhoodId = searchParams.get('neighborhoodId')

  let query = sql`SELECT * FROM houses`
  if (neighborhoodId) {
    query = sql`SELECT * FROM houses WHERE neighborhood_id = ${neighborhoodId}`
  }
  const rows = await db.execute(query)
  return NextResponse.json(rows.rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  assertRole(session?.user?.role, 'admin', 'manager', 'rep')
  const body = await req.json()
  const { address, lat, lng } = body

  const neighborhoodResult = await db.execute(
    sql`SELECT id FROM neighborhoods
        WHERE ST_Within(ST_SetSRID(ST_Point(${lng}, ${lat}), 4326), boundary)
        LIMIT 1`
  )
  const neighborhoodId = neighborhoodResult.rows[0]?.id ?? null

  const [house] = await db.insert(houses).values({
    address,
    lat,
    lng,
    neighborhoodId: neighborhoodId as string | null,
  }).returning()

  return NextResponse.json(house, { status: 201 })
}
