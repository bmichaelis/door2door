export const runtime = 'edge'
import { LoginButton } from './login-button'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-6 p-8">
        <h1 className="text-2xl font-bold">Door2Door</h1>
        <LoginButton />
      </div>
    </div>
  )
}
