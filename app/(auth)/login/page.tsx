import { signIn } from '@/lib/auth'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-6 p-8">
        <h1 className="text-2xl font-bold">Door2Door</h1>
        <form action={async () => { 'use server'; await signIn('google') }}>
          <Button type="submit">Sign in with Google</Button>
        </form>
      </div>
    </div>
  )
}
