export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ParcelImportClient } from './client'

export default async function ParcelImportPage() {
  const session = await auth()
  if (session?.user?.role !== 'admin') redirect('/map')
  return <ParcelImportClient />
}
