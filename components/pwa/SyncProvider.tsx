'use client'
import { createContext, useContext, useCallback, useEffect, useState } from 'react'
import { listQueuedVisits, removeQueuedVisit, queuedVisitCount } from '@/lib/visit-queue'

type SyncContext = { pending: number; refresh: () => void }
const Ctx = createContext<SyncContext>({ pending: 0, refresh: () => {} })

export function useSync() {
  return useContext(Ctx)
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState(0)

  const refresh = useCallback(() => {
    queuedVisitCount().then(setPending).catch(() => {})
  }, [])

  const flush = useCallback(async () => {
    let queued: Awaited<ReturnType<typeof listQueuedVisits>>
    try {
      queued = await listQueuedVisits()
    } catch {
      return
    }
    for (const v of queued) {
      try {
        const res = await fetch(v.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(v.payload),
        })
        // Remove on a definitive server response (success OR rejection);
        // keep only when the network itself failed again.
        await removeQueuedVisit(v.id)
        void res
      } catch {
        // still offline — leave it queued, stop draining this pass
        break
      }
    }
    refresh()
  }, [refresh])

  useEffect(() => {
    flush()
    const onOnline = () => flush()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [flush])

  return <Ctx.Provider value={{ pending, refresh }}>{children}</Ctx.Provider>
}
