import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { houses } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql } from 'drizzle-orm'

export const runtime = 'edge'
export const maxDuration = 300 // Vercel only; no-op on Cloudflare Workers

const BATCH_SIZE = 500

type AddressRecord = {
  number: string
  street: string
  unit: string
  city: string
  region: string
  postcode: string
  externalId: string
  lng: number
  lat: number
}

function parseFeatureLine(line: string): AddressRecord | null {
  try {
    const feature = JSON.parse(line)
    if (feature?.type !== 'Feature') return null
    const props = feature.properties ?? {}
    const coords = feature.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) return null
    if (!props.number || !props.street) return null

    return {
      number: String(props.number),
      street: String(props.street),
      unit: String(props.unit ?? ''),
      city: String(props.city ?? ''),
      region: String(props.region ?? ''),
      postcode: String(props.postcode ?? ''),
      externalId: String(props.hash ?? ''),
      lng: Number(coords[0]),
      lat: Number(coords[1]),
    }
  } catch {
    return null
  }
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager')

  // Accept multipart/form-data (browser upload) or raw body (curl)
  let text: string
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
    text = await file.text()
  } else {
    text = await req.text()
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  const records: AddressRecord[] = []
  let skipped = 0

  for (const line of lines) {
    const record = parseFeatureLine(line)
    if (record) {
      records.push(record)
    } else {
      skipped++
    }
  }

  let imported = 0

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)

    // One query: assign neighborhood IDs to all records in this batch via lateral join.
    // This replaces one SELECT per record, collapsing 500 subrequests → 1.
    const { rows } = await db.execute(sql`
      WITH points (idx, lng, lat) AS (
        VALUES ${sql.join(
          batch.map((r, idx) => sql`(${idx}::int, ${r.lng}::float8, ${r.lat}::float8)`),
          sql`, `
        )}
      )
      SELECT p.idx, n.id AS neighborhood_id
      FROM points p
      LEFT JOIN LATERAL (
        SELECT id FROM neighborhoods
        WHERE ST_Within(ST_SetSRID(ST_Point(p.lng, p.lat), 4326), boundary)
        LIMIT 1
      ) n ON true
    `)

    const neighborhoodIds = new Map<number, string | null>()
    for (const row of rows) {
      neighborhoodIds.set(Number(row.idx), (row.neighborhood_id as string | null) ?? null)
    }

    // One query: bulk insert all records in this batch.
    // This replaces one INSERT per record, collapsing 500 subrequests → 1.
    const inserted = await db.insert(houses).values(
      batch.map((r, idx) => ({
        number: r.number,
        street: r.street,
        unit: r.unit || null,
        city: r.city,
        region: r.region,
        postcode: r.postcode,
        externalId: r.externalId || null,
        location: sql`ST_SetSRID(ST_Point(${r.lng}, ${r.lat}), 4326)`,
        neighborhoodId: neighborhoodIds.get(idx) ?? null,
      }))
    ).onConflictDoNothing().returning({ id: houses.id })

    imported += inserted.length
    skipped += batch.length - inserted.length
  }

  return NextResponse.json({ imported, skipped, total: lines.length })
})
