export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { sql } from 'drizzle-orm'

type ParcelItem = {
  ownerName: string
  geom: object // GeoJSON Polygon or MultiPolygon geometry
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    requireRole(session?.user?.role, 'admin')

    const items: ParcelItem[] = await req.json()
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Expected non-empty array' }, { status: 400 })
    }

    const valid = items.filter(i => i.ownerName?.trim() && i.geom)
    if (valid.length === 0) {
      return NextResponse.json({ updated: 0, created: 0 })
    }

    // One query:
    // 1. Expand the input JSON array into (owner_name, geom) rows
    // 2. Spatial join: find every house whose point falls within one of those polygons
    // 3. UPDATE existing active household surnames
    // 4. INSERT new households for houses with no active household yet
    const result = await db.execute(sql`
      WITH input AS (
        SELECT
          (item->>'ownerName')::text                                      AS owner_name,
          ST_SetSRID(ST_GeomFromGeoJSON(item->>'geom'), 4326)             AS geom
        FROM json_array_elements(${JSON.stringify(valid)}::json) AS item
      ),
      matched AS (
        SELECT DISTINCT ON (h.id)
          h.id   AS house_id,
          i.owner_name
        FROM input i
        JOIN houses h ON ST_Within(h.location, i.geom)
        ORDER BY h.id, i.owner_name
      ),
      updated AS (
        UPDATE households hh
        SET surname = m.owner_name
        FROM matched m
        WHERE hh.house_id = m.house_id
          AND hh.active = true
        RETURNING hh.house_id
      ),
      inserted AS (
        INSERT INTO households (id, house_id, surname, active, created_at)
        SELECT gen_random_uuid(), m.house_id, m.owner_name, true, now()
        FROM matched m
        WHERE m.house_id NOT IN (SELECT house_id FROM updated)
          AND NOT EXISTS (
            SELECT 1 FROM households ex
            WHERE ex.house_id = m.house_id AND ex.active = true
          )
        RETURNING house_id
      )
      SELECT
        (SELECT count(*) FROM updated)::int  AS updated,
        (SELECT count(*) FROM inserted)::int AS created
    `)

    const row = result.rows[0] ?? {}
    return NextResponse.json({
      updated: Number(row.updated ?? 0),
      created: Number(row.created ?? 0),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('[parcels/import]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
