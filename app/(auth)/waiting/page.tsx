export const runtime = 'edge'
import { signOut } from '@/lib/auth'
import { Button } from '@/components/ui/button'

export default function WaitingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Waiting for access</h1>
        <p className="text-muted-foreground max-w-sm">
          Your account was created. An admin needs to assign you a role before you can continue.
        </p>
        <form action={async () => { 'use server'; await signOut() }}>
          <Button variant="outline" type="submit">Sign out</Button>
        </form>
      </div>
    </div>
  )
}
