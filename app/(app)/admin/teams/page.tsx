export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { teams, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export default async function TeamsPage() {
  const session = await auth()
  if (session?.user?.role !== 'admin') redirect('/map')

  const rows = await db.select({
    id: teams.id,
    name: teams.name,
    managerId: teams.managerId,
    managerName: users.name,
  })
    .from(teams)
    .leftJoin(users, eq(teams.managerId, users.id))
    .orderBy(teams.name)

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Teams</h1>
      <ul className="space-y-2">
        {rows.map(t => (
          <li key={t.id} className="flex items-center justify-between border rounded p-3">
            <span className="font-medium">{t.name}</span>
            <span className="text-sm text-muted-foreground">
              {t.managerName ? `Manager: ${t.managerName}` : 'No manager'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
