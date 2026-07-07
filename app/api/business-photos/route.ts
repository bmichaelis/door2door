export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { businessPhotos } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { getPhotosBucket } from '@/lib/photos-server'
import { sql } from 'drizzle-orm'

const MAX_BYTES = 8 * 1024 * 1024

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const businessId = new URL(req.url).searchParams.get('businessId')
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 })

  const rows = await db.execute(sql`
    SELECT p.id, p.user_id AS "userId", p.created_at AS "createdAt",
      COALESCE(u.name, 'Unknown') AS "authorName"
    FROM business_photos p LEFT JOIN users u ON u.id = p.user_id
    WHERE p.business_id = ${businessId} ORDER BY p.created_at DESC`)
  return NextResponse.json(rows.rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const businessId = new URL(req.url).searchParams.get('businessId')
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 })

  const bucket = getPhotosBucket()
  if (!bucket) return NextResponse.json({ error: 'Photo storage is not configured' }, { status: 503 })

  if (!req.headers.get('content-type')?.startsWith('image/jpeg')) {
    return NextResponse.json({ error: 'Content-Type must be image/jpeg' }, { status: 415 })
  }
  const bytes = await req.arrayBuffer()
  if (bytes.byteLength === 0) return NextResponse.json({ error: 'empty body' }, { status: 400 })
  if (bytes.byteLength > MAX_BYTES) return NextResponse.json({ error: 'photo too large' }, { status: 413 })

  const id = crypto.randomUUID()
  const key = `business/${businessId}/${id}.jpg`
  await bucket.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } })
  try {
    await db.insert(businessPhotos).values({ id, businessId, userId: session!.user!.id, r2Key: key })
  } catch (e) {
    await bucket.delete(key).catch(() => {})
    throw e
  }
  return NextResponse.json({ id }, { status: 201 })
})
