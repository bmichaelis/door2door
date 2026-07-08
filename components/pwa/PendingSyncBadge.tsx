'use client'
import { CloudOffIcon } from 'lucide-react'
import { useSync } from './SyncProvider'

export function PendingSyncBadge() {
  const { pending } = useSync()
  if (pending === 0) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
      <CloudOffIcon className="h-3.5 w-3.5" />
      {pending} pending
    </span>
  )
}
