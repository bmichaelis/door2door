'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState, useRef, useEffect } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = { role: string }

const ADMIN_ITEMS = [
  { href: '/admin/users',          label: 'Users',         roles: ['admin', 'manager'] },
  { href: '/admin/teams',          label: 'Teams',         roles: ['admin'] },
  { href: '/admin/businesses',     label: 'Businesses',    roles: ['admin'] },
  { href: '/admin/import',         label: 'Import',        roles: ['admin'] },
  { href: '/admin/neighborhoods',  label: 'Neighborhoods', roles: ['admin'] },
]

export function NavBar({ role }: Props) {
  const pathname = usePathname()
  const [adminOpen, setAdminOpen] = useState(false)
  const adminRef = useRef<HTMLDivElement>(null)

  const adminItems = ADMIN_ITEMS.filter(i => i.roles.includes(role))
  const isAdminRoute = pathname.startsWith('/admin')

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (adminRef.current && !adminRef.current.contains(e.target as Node)) {
        setAdminOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function navLink(href: string, label: string) {
    const active = pathname === href
    return (
      <Link
        href={href}
        className={cn(
          'text-sm px-3 py-1.5 rounded-md transition-colors',
          active
            ? 'bg-muted font-semibold text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        )}
      >
        {label}
      </Link>
    )
  }

  return (
    <header className="border-b px-4 py-2 flex items-center justify-between gap-4">
      <nav className="flex items-center gap-1">
        {navLink('/map', 'Map')}
        {navLink('/dashboard', 'Dashboard')}

        {adminItems.length > 0 && (
          <div ref={adminRef} className="relative">
            <button
              onClick={() => setAdminOpen(o => !o)}
              className={cn(
                'flex items-center gap-1 text-sm px-3 py-1.5 rounded-md transition-colors',
                isAdminRoute
                  ? 'bg-muted font-semibold text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              Admin
              <ChevronDownIcon className={cn('h-3.5 w-3.5 transition-transform', adminOpen && 'rotate-180')} />
            </button>

            {adminOpen && (
              <div className="absolute top-full left-0 mt-1 w-44 rounded-xl border bg-popover shadow-lg py-1 z-50">
                {adminItems.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setAdminOpen(false)}
                    className={cn(
                      'block px-3 py-2 text-sm transition-colors',
                      pathname === item.href
                        ? 'bg-muted font-medium text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      <button
        onClick={() => signOut()}
        className="text-sm px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        Sign out
      </button>
    </header>
  )
}
