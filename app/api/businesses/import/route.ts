export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { businesses } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql } from 'drizzle-orm'

type BusinessInput = {
  externalId: string
  name: string
  type: string | null
  category: string | null
  number: string | null
  street: string | null
  city: string | null
  region: string | null
  postcode: string | null
  phone: string | null
  website: string | null
  lat: number
  lng: number
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')

  const items: BusinessInput[] = await req.json()
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Expected non-empty array' }, { status: 400 })
  }

  let imported = 0
  let skipped = 0

  for (const item of items) {
    if (!item.name || item.lat == null || item.lng == null) { skipped++; continue }

    // Assign to neighborhood if location falls within one
    const nbhd = await db.execute(
      sql`SELECT id FROM neighborhoods
          WHERE ST_Within(ST_SetSRID(ST_Point(${item.lng}, ${item.lat}), 4326), boundary)
          LIMIT 1`
    )
    const neighborhoodId = (nbhd.rows[0]?.id as string) ?? null

    await db.insert(businesses).values({
      name: item.name,
      type: item.type,
      category: item.category,
      number: item.number,
      street: item.street,
      city: item.city,
      region: item.region,
      postcode: item.postcode,
      phone: item.phone,
      website: item.website,
      externalId: item.externalId,
      location: sql`ST_SetSRID(ST_Point(${item.lng}, ${item.lat}), 4326)`,
      neighborhoodId,
    }).onConflictDoUpdate({
      target: businesses.externalId,
      set: {
        name: item.name,
        type: item.type,
        category: item.category,
        number: item.number,
        street: item.street,
        city: item.city,
        region: item.region,
        postcode: item.postcode,
        phone: item.phone,
        website: item.website,
        neighborhoodId,
      },
    })
    imported++
  }

  return NextResponse.json({ imported, skipped, total: items.length })
})
