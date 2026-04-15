import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { NavBar } from './nav-bar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.role) redirect('/waiting')

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar role={session.user.role} />
      <main className="flex-1">{children}</main>
    </div>
  )
}
