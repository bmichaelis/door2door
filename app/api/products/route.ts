import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { products } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'

export const GET = withErrorHandling(async () => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const rows = await db.select().from(products).orderBy(products.name)
  return NextResponse.json(rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const [product] = await db.insert(products).values({
    name: body.name,
    description: body.description ?? null,
  }).returning()
  return NextResponse.json(product, { status: 201 })
})
