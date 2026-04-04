import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { products } from '@/lib/db/schema'
import { assertRole } from '@/lib/permissions'
import { eq } from 'drizzle-orm'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  assertRole(session?.user?.role, 'admin')
  const { id } = await params
  const body = await req.json()
  const [product] = await db.update(products)
    .set({ name: body.name, description: body.description, active: body.active })
    .where(eq(products.id, id))
    .returning()
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(product)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  assertRole(session?.user?.role, 'admin')
  const { id } = await params
  await db.delete(products).where(eq(products.id, id))
  return new NextResponse(null, { status: 204 })
}
