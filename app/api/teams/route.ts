import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { teams } from '@/lib/db/schema'
import { assertRole } from '@/lib/permissions'

export async function GET() {
  const session = await auth()
  assertRole(session?.user?.role, 'admin', 'manager', 'rep')
  const rows = await db.select().from(teams).orderBy(teams.name)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  assertRole(session?.user?.role, 'admin')
  const body = await req.json()
  const [team] = await db.insert(teams).values({
    name: body.name,
    managerId: body.managerId ?? null,
  }).returning()
  return NextResponse.json(team, { status: 201 })
}
