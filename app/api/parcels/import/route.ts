export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { sql } from 'drizzle-orm'

type ParcelItem = {
  ownerName: string
  address: string  // pre-normalized on client: split on comma, uppercased
}

// Normalize an address to a canonical form for matching:
//   1. Uppercase + trim
//   2. Strip common street type suffixes (ST, AVE, DR, etc.)
//   3. Abbreviate trailing cardinal direction words: NORTH→N, SOUTH→S, EAST→E, WEST→W
//
// "3047 W 1930 NORTH ST" → "3047 W 1930 N"
// "3047 W 1930 N"        → "3047 W 1930 N"   (parcel already abbreviated)
// "239 E RIDGE RD"       → "239 E RIDGE"
// "1695 N 350 WEST ST"   → "1695 N 350 W"
const NORMALIZE = (expr: ReturnType<typeof sql>) => sql`
  regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      regexp_replace(upper(trim(${expr})), '\s+(ST|AVE|BLVD|DR|LN|RD|CT|CIR|WAY|PL|LOOP|PKWY)$', ''),
    '\sNORTH$', ' N'), '\sSOUTH$', ' S'), '\sEAST$', ' E'), '\sWEST$', ' W')
  , '\sN$', ' N')`

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    requireRole(session?.user?.role, 'admin')

    const items: ParcelItem[] = await req.json()
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Expected non-empty array' }, { status: 400 })
    }

    const valid = items.filter(i => i.ownerName?.trim() && i.address?.trim())
    if (valid.length === 0) {
      return NextResponse.json({ updated: 0, created: 0 })
    }

    const result = await db.execute(sql`
      WITH input AS (
        SELECT
          (item->>'ownerName')::text                                    AS owner_name,
          ${NORMALIZE(sql`(item->>'address')::text`)}                  AS address
        FROM json_array_elements(${JSON.stringify(valid)}::json) AS item
      ),
      matched AS (
        SELECT DISTINCT ON (h.id)
          h.id        AS house_id,
          i.owner_name
        FROM input i
        JOIN houses h
          ON ${NORMALIZE(sql`h.number || ' ' || h.street`)} = i.address
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
