import { auth } from '@/lib/auth'
import { SignOutButton } from './sign-out-button'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.role) redirect('/waiting')

  const { role } = session.user

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <nav className="flex gap-4 text-sm">
          <Link href="/map" className="font-medium">Map</Link>
          <Link href="/dashboard">Dashboard</Link>
          {(role === 'admin' || role === 'manager') && (
            <Link href="/admin/users">Admin</Link>
          )}
          {role === 'admin' && (
            <Link href="/admin/teams">Teams</Link>
          )}
          {role === 'admin' && (
            <Link href="/admin/import">Import</Link>
          )}
          {role === 'admin' && (
            <Link href="/admin/neighborhoods">Neighborhoods</Link>
          )}
        </nav>
        <SignOutButton />
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
