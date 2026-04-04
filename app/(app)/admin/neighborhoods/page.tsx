import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { teams } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'
import { NeighborhoodAdminClient } from './client'

export default async function NeighborhoodsPage() {
  const session = await auth()
  if (session?.user?.role !== 'admin') redirect('/map')

  const rows = await db.execute(
    sql`SELECT n.id, n.name, n.team_id, t.name as team_name
        FROM neighborhoods n LEFT JOIN teams t ON n.team_id = t.id ORDER BY n.name`
  )
  const teamsList = await db.select({ id: teams.id, name: teams.name }).from(teams)

  return <NeighborhoodAdminClient neighborhoods={rows.rows as any} teams={teamsList} />
}
