import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getRepStats, getManagerStats, getAdminStats } from '@/lib/stats'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.role) redirect('/waiting')

  const { role, id: userId, teamId } = session.user

  if (role === 'rep') {
    const stats = await getRepStats(userId)
    const { RepStats } = await import('@/components/dashboard/RepStats')
    return <RepStats stats={stats} />
  }
  if (role === 'manager') {
    const stats = await getManagerStats(teamId!)
    const { ManagerStats } = await import('@/components/dashboard/ManagerStats')
    return <ManagerStats stats={stats} />
  }
  const stats = await getAdminStats()
  const { AdminStats } = await import('@/components/dashboard/AdminStats')
  return <AdminStats stats={stats} />
}
