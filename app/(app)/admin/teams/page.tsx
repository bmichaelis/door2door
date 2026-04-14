export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { teams, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { TeamsClient } from './teams-client'

export default async function TeamsPage() {
  const session = await auth()
  if (session?.user?.role !== 'admin') redirect('/map')

  const [rows, managerRows] = await Promise.all([
    db.select({
      id: teams.id,
      name: teams.name,
      managerId: teams.managerId,
      managerName: users.name,
    })
      .from(teams)
      .leftJoin(users, eq(teams.managerId, users.id))
      .orderBy(teams.name),
    db.select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .orderBy(users.name),
  ])

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Teams</h1>
      <TeamsClient initialTeams={rows} managers={managerRows} />
    </div>
  )
}
