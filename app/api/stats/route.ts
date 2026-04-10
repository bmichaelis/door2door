export const runtime = 'edge'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { getRepStats, getManagerStats, getAdminStats } from '@/lib/stats'

export const GET = withErrorHandling(async () => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { role, id: userId, teamId } = session!.user!

  if (role === 'rep') return NextResponse.json(await getRepStats(userId))
  if (role === 'manager') return NextResponse.json(await getManagerStats(teamId!))
  return NextResponse.json(await getAdminStats())
})
