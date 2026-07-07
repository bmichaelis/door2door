export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { TerritoriesClient } from './client'

export default async function TerritoriesPage() {
  const session = await auth()
  const role = session?.user?.role
  if (!role) redirect('/waiting')
  if (role !== 'admin' && role !== 'manager') redirect('/map')

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold mb-1">Territories</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Assign neighborhoods to reps and track their lifecycle. Assigned reps
        see their territories highlighted on the map.
      </p>
      <TerritoriesClient currentUser={{ id: session.user.id, role, teamId: session.user.teamId ?? null }} />
    </div>
  )
}
