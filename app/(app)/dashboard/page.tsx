import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.role) redirect('/waiting')

  const res = await fetch(`${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/api/stats`, {
    cache: 'no-store',
  })
  const stats = await res.json()
  const { role } = session.user

  if (role === 'rep') {
    const { RepStats } = await import('@/components/dashboard/RepStats')
    return <RepStats stats={stats} />
  }
  if (role === 'manager') {
    const { ManagerStats } = await import('@/components/dashboard/ManagerStats')
    return <ManagerStats stats={stats} />
  }
  const { AdminStats } = await import('@/components/dashboard/AdminStats')
  return <AdminStats stats={stats} />
}
