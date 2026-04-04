import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { products } from '@/lib/db/schema'
import { assertRole } from '@/lib/permissions'

export async function GET() {
  const session = await auth()
  assertRole(session?.user?.role, 'admin', 'manager', 'rep')
  const rows = await db.select().from(products).orderBy(products.name)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  assertRole(session?.user?.role, 'admin')
  const body = await req.json()
  const [product] = await db.insert(products).values({
    name: body.name,
    description: body.description ?? null,
  }).returning()
  return NextResponse.json(product, { status: 201 })
}
