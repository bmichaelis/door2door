export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { users, teams } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'

export default async function UsersPage() {
  const session = await auth()
  if (session?.user?.role !== 'admin') redirect('/map')

  const rows = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    teamName: teams.name,
  })
    .from(users)
    .leftJoin(teams, eq(users.teamId, teams.id))
    .orderBy(users.name)

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Users</h1>
      <ul className="space-y-2">
        {rows.map(u => (
          <li key={u.id} className="flex items-center justify-between border rounded p-3">
            <div>
              <span className="font-medium">{u.name ?? u.email}</span>
              <p className="text-sm text-muted-foreground">{u.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{u.role ?? 'pending'}</Badge>
              <span className="text-sm text-muted-foreground">{u.teamName ?? '—'}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
