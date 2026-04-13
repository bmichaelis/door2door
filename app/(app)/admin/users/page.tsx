export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { users, teams } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { UserList } from './user-list'

export default async function UsersPage() {
  const session = await auth()
  if (session?.user?.role !== 'admin') redirect('/map')

  const [rows, teamRows] = await Promise.all([
    db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      teamName: teams.name,
      teamId: users.teamId,
    })
      .from(users)
      .leftJoin(teams, eq(users.teamId, teams.id))
      .orderBy(users.name),
    db.select({ id: teams.id, name: teams.name }).from(teams).orderBy(teams.name),
  ])

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Users</h1>
      <UserList initialUsers={rows} teams={teamRows} />
    </div>
  )
}
