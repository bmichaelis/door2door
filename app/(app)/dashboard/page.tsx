export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getRepStats, getManagerStats, getAdminStats, getLeaderboard, type LeaderboardRow } from '@/lib/stats'
import { Leaderboard } from '@/components/dashboard/Leaderboard'

function LeaderboardSection({ rows, userId }: { rows: LeaderboardRow[] | null; userId: string }) {
  if (!rows) return null
  return (
    <div className="max-w-lg px-6 pb-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Leaderboard</h2>
      <Leaderboard rows={rows} currentUserId={userId} />
    </div>
  )
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.role) redirect('/waiting')

  const { role, id: userId, teamId } = session.user

  if (role === 'rep') {
    const [stats, leaderboard] = await Promise.all([
      getRepStats(userId),
      teamId ? getLeaderboard(teamId) : null,
    ])
    const { RepStats } = await import('@/components/dashboard/RepStats')
    return (
      <div>
        <RepStats stats={stats} />
        <LeaderboardSection rows={leaderboard} userId={userId} />
      </div>
    )
  }
  if (role === 'manager') {
    const [stats, leaderboard] = await Promise.all([
      getManagerStats(teamId!),
      teamId ? getLeaderboard(teamId) : null,
    ])
    const { ManagerStats } = await import('@/components/dashboard/ManagerStats')
    return (
      <div>
        <ManagerStats stats={stats} />
        <LeaderboardSection rows={leaderboard} userId={userId} />
      </div>
    )
  }
  const [stats, leaderboard] = await Promise.all([getAdminStats(), getLeaderboard(null)])
  const { AdminStats } = await import('@/components/dashboard/AdminStats')
  return (
    <div>
      <AdminStats stats={stats} />
      <LeaderboardSection rows={leaderboard} userId={userId} />
    </div>
  )
}
