export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { statuses } from '@/lib/db/schema'
import { StatusesClient } from './client'

export default async function StatusesPage() {
  const session = await auth()
  if (session?.user?.role !== 'admin') redirect('/map')

  const rows = await db.select().from(statuses).orderBy(statuses.sortOrder, statuses.createdAt)

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-1">Statuses</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Statuses reps can set on houses and businesses. System statuses are set
        automatically from visit outcomes and cannot be deleted.
      </p>
      <StatusesClient initialStatuses={rows} />
    </div>
  )
}
