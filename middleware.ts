import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth
  const hasRole = !!req.auth?.user?.role

  if (!isLoggedIn && !pathname.startsWith('/login') && !pathname.startsWith('/api/auth')) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (isLoggedIn && !hasRole && !pathname.startsWith('/waiting') && !pathname.startsWith('/api/auth')) {
    return NextResponse.redirect(new URL('/waiting', req.url))
  }
  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
