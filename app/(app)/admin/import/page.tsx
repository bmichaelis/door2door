export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ImportClient } from './client'

export default async function ImportPage() {
  const session = await auth()
  // Layout guards against unauthenticated users; this page additionally restricts to admin role only
  if (session?.user?.role !== 'admin') redirect('/map')
  return <ImportClient />
}
