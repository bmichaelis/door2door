export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { businessPhotos } from '@/lib/db/schema'
import { requireRole, canDeleteNote } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { getPhotosBucket } from '@/lib/photos-server'
import { eq } from 'drizzle-orm'

export const GET = withErrorHandling(async (_req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { id } = await params

  const [photo] = await db.select().from(businessPhotos).where(eq(businessPhotos.id, id))
  if (!photo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const bucket = getPhotosBucket()
  if (!bucket) return NextResponse.json({ error: 'Photo storage is not configured' }, { status: 503 })

  const object = await bucket.get(photo.r2Key)
  if (!object) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return new NextResponse(object.body, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { id } = await params

  const [photo] = await db.select().from(businessPhotos).where(eq(businessPhotos.id, id))
  if (!photo) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canDeleteNote({ id: session!.user!.id!, role: session!.user!.role }, photo)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const bucket = getPhotosBucket()
  if (!bucket) return NextResponse.json({ error: 'Photo storage is not configured' }, { status: 503 })

  await bucket.delete(photo.r2Key)
  await db.delete(businessPhotos).where(eq(businessPhotos.id, id))
  return new NextResponse(null, { status: 204 })
})
