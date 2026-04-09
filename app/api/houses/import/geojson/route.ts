import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { houses } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql } from 'drizzle-orm'

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

  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const text = await file.text()
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

    const results = await Promise.allSettled(
      batch.map(async (r) => {
        const neighborhoodResult = await db.execute(
          sql`SELECT id FROM neighborhoods
              WHERE ST_Within(ST_SetSRID(ST_Point(${r.lng}, ${r.lat}), 4326), boundary)
              LIMIT 1`
        )
        const neighborhoodId = neighborhoodResult.rows[0]?.id as string | null

        const [house] = await db.insert(houses).values({
          number: r.number,
          street: r.street,
          unit: r.unit || null,
          city: r.city,
          region: r.region,
          postcode: r.postcode,
          externalId: r.externalId || null,
          location: sql`ST_SetSRID(ST_Point(${r.lng}, ${r.lat}), 4326)`,
          neighborhoodId,
        }).onConflictDoNothing().returning()

        return house ?? null
      })
    )

    imported += results.filter(r => r.status === 'fulfilled' && r.value).length
  }

  return NextResponse.json({ imported, skipped, total: lines.length })
})
