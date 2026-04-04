import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { houses } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { geocodeAddress } from '@/lib/mapbox'
import { sql } from 'drizzle-orm'

const BATCH_SIZE = 10

async function processAddress(address: string) {
  const coords = await geocodeAddress(address)
  if (!coords) return null

  const neighborhoodResult = await db.execute(
    sql`SELECT id FROM neighborhoods
        WHERE ST_Within(ST_SetSRID(ST_Point(${coords.lng}, ${coords.lat}), 4326), boundary)
        LIMIT 1`
  )
  const neighborhoodId = neighborhoodResult.rows[0]?.id as string | null

  const [house] = await db.insert(houses).values({
    address,
    lat: coords.lat,
    lng: coords.lng,
    neighborhoodId,
  }).onConflictDoNothing().returning()
  return house ?? null
}

// Expects multipart form with a CSV file
// CSV format: address (one per line, no header required)
export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager')
  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const text = await file.text()
  const addresses = text.split('\n').map(l => l.trim()).filter(Boolean)

  let imported = 0
  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    const batch = addresses.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(batch.map(processAddress))
    imported += results.filter(r => r.status === 'fulfilled' && r.value).length
  }

  return NextResponse.json({ imported, total: addresses.length })
})
