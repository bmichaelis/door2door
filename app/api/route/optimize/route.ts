export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { optimizeOrder } from '@/lib/route/optimize'
import { buildGoogleMapsDirUrl } from '@/lib/route/google-maps-url'
import type { LatLng, Stop } from '@/lib/route/geo'

function isLatLng(v: unknown): v is LatLng {
  return !!v && typeof (v as LatLng).lat === 'number' && typeof (v as LatLng).lng === 'number'
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')

  const body = (await req.json()) as { start?: unknown; stops?: unknown }
  if (!isLatLng(body.start)) {
    return NextResponse.json({ error: 'start {lat,lng} required' }, { status: 400 })
  }
  const stops = body.stops
  if (!Array.isArray(stops) || stops.length < 2 || stops.length > 10 || !stops.every(isLatLng)) {
    return NextResponse.json({ error: 'stops must be 2–10 points with {lat,lng}' }, { status: 400 })
  }

  const orderedStops = await optimizeOrder(body.start, stops as Stop[])
  const googleMapsUrl = buildGoogleMapsDirUrl(body.start, orderedStops)
  return NextResponse.json({ orderedStops, googleMapsUrl })
})
