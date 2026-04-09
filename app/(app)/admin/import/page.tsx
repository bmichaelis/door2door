import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ImportClient } from './client'

export default async function ImportPage() {
  const session = await auth()
  if (session?.user?.role !== 'admin') redirect('/map')
  return <ImportClient />
}
