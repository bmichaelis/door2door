export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { MapShell } from '@/components/map/MapShell'

export default async function MapPage() {
  const session = await auth()
  if (!session?.user?.role) redirect('/waiting')
  return <MapShell userRole={session.user.role} />
}
