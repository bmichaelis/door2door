export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getAgenda } from '@/lib/appointments-server'
import { AgendaList } from '@/components/appointments/AgendaList'

export default async function AppointmentsPage() {
  const session = await auth()
  if (!session?.user?.role) redirect('/waiting')

  const { role, id: userId, teamId } = session.user
  const rows = await getAgenda({ role, userId, teamId: teamId ?? null })

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Appointments</h1>
      <AgendaList initialRows={rows} showRep={role !== 'rep'} />
    </div>
  )
}
