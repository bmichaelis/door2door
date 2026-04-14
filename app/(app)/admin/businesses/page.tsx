export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { BusinessImportClient } from './client'

export default async function BusinessesPage() {
  const session = await auth()
  if (session?.user?.role !== 'admin') redirect('/map')

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-1">Businesses</h1>
      <p className="text-sm text-muted-foreground mb-6">Import business locations from OpenStreetMap.</p>
      <BusinessImportClient />
    </div>
  )
}
