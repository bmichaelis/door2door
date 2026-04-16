export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function RootPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!session.user.role) redirect('/waiting')
  redirect('/map')
  return null
}
