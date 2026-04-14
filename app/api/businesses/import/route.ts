export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { businesses } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
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

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    requireRole(session?.user?.role, 'admin')

    const items: BusinessInput[] = await req.json()
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Expected non-empty array' }, { status: 400 })
    }

    const valid = items.filter(i => i.name && i.lat != null && i.lng != null)
    const skipped = items.length - valid.length

    if (valid.length === 0) {
      return NextResponse.json({ imported: 0, skipped, total: items.length })
    }

    // Single query to find neighborhood for each coordinate
    const valuesList = valid.map((item, i) =>
      sql`(${i}, ${item.lng}::float8, ${item.lat}::float8)`
    )
    const valuesClause = sql.join(valuesList, sql`, `)

    const nbhdResult = await db.execute(sql`
      WITH coords(idx, lng, lat) AS (VALUES ${valuesClause})
      SELECT c.idx::int AS idx, n.id AS neighborhood_id
      FROM coords c
      LEFT JOIN neighborhoods n
        ON ST_Within(ST_SetSRID(ST_Point(c.lng, c.lat), 4326), n.boundary)
    `)

    const neighborhoodIds = new Map<number, string | null>()
    for (const row of nbhdResult.rows) {
      neighborhoodIds.set(row.idx as number, (row.neighborhood_id as string) ?? null)
    }

    // Single bulk upsert
    await db.insert(businesses).values(
      valid.map((item, i) => ({
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
        neighborhoodId: neighborhoodIds.get(i) ?? null,
      }))
    ).onConflictDoUpdate({
      target: businesses.externalId,
      set: {
        name: sql`EXCLUDED.name`,
        type: sql`EXCLUDED.type`,
        category: sql`EXCLUDED.category`,
        number: sql`EXCLUDED.number`,
        street: sql`EXCLUDED.street`,
        city: sql`EXCLUDED.city`,
        region: sql`EXCLUDED.region`,
        postcode: sql`EXCLUDED.postcode`,
        phone: sql`EXCLUDED.phone`,
        website: sql`EXCLUDED.website`,
        neighborhoodId: sql`EXCLUDED.neighborhood_id`,
      },
    })

    // Remove cross-source duplicates: same name within 100m, keep the record
    // with the most complete data, preferring Overture over OSM on ties.
    await db.execute(sql`
      DELETE FROM businesses b
      WHERE EXISTS (
        SELECT 1 FROM businesses better
        WHERE lower(trim(better.name)) = lower(trim(b.name))
          AND better.id != b.id
          AND ST_DWithin(better.location::geography, b.location::geography, 100)
          AND (
            (CASE WHEN better.phone   IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN better.website IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN better.number  IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN better.street  IS NOT NULL THEN 1 ELSE 0 END)
            >
            (CASE WHEN b.phone   IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN b.website IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN b.number  IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN b.street  IS NOT NULL THEN 1 ELSE 0 END)
            OR (
              (CASE WHEN better.phone   IS NOT NULL THEN 1 ELSE 0 END +
               CASE WHEN better.website IS NOT NULL THEN 1 ELSE 0 END +
               CASE WHEN better.number  IS NOT NULL THEN 1 ELSE 0 END +
               CASE WHEN better.street  IS NOT NULL THEN 1 ELSE 0 END)
              =
              (CASE WHEN b.phone   IS NOT NULL THEN 1 ELSE 0 END +
               CASE WHEN b.website IS NOT NULL THEN 1 ELSE 0 END +
               CASE WHEN b.number  IS NOT NULL THEN 1 ELSE 0 END +
               CASE WHEN b.street  IS NOT NULL THEN 1 ELSE 0 END)
              AND (
                (better.external_id LIKE 'overture:%' AND b.external_id NOT LIKE 'overture:%')
                OR (
                  (better.external_id LIKE 'overture:%') = (b.external_id LIKE 'overture:%')
                  AND better.id::text > b.id::text
                )
              )
            )
          )
      )
    `)

    return NextResponse.json({ imported: valid.length, skipped, total: items.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('[businesses/import]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
