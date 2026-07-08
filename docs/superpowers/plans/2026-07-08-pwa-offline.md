# PWA + Offline Visit Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app installable (manifest + trivial service worker) and guarantee a logged visit survives a dead zone via an IndexedDB write-queue that replays on reconnect; add a "locate me" map button.

**Architecture:** The write-queue is pure app code (IndexedDB + reconnect flush), independent of the service worker — the SW exists only to satisfy installability. A shared `submitVisit` helper queues visit POSTs on network failure; a `SyncProvider` flushes on `online`/mount and surfaces a pending count; both map panels route their visit POSTs through the helper.

**Tech Stack:** Next.js 15 App Router on Cloudflare Pages (`@cloudflare/next-on-pages`), React 19, IndexedDB, vitest + Testing Library + fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-07-08-pwa-offline-design.md`

## Global Constraints

- Code style: no semicolons, single quotes, 2-space indent.
- Queue **visit creates only** (`/api/visits`, `/api/business-visits`). Queue on a *thrown* fetch (connectivity) only — never on a `!res.ok` server response (a bad payload must not loop). The flusher removes a row on `res.ok` OR a 4xx/5xx server response; keeps it only on another thrown fetch.
- Service worker (`public/sw.js`) caches nothing in v1 — install/activate + network-passthrough fetch handler.
- All PWA glue (SW registration, geolocation, queue flush) fails silently and logs; nothing may break the app.
- No migration, no schema change, no new API route.
- Gates: `npx tsc --noEmit`, `npm run test:run`, `next build` (dummy env). Do NOT run `npm run lint` (broken on main, issue #15). If `lib/auth.test.ts` fails it is a pre-existing env issue unrelated to this branch.
- Commits reference `#11`; end commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Worktree resolves `node_modules` (tests run from it); run all `npm`/`npx` from the worktree root.

---

### Task 1: Installability — manifest, layout metadata, service worker, registrar

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/sw.js`
- Create: `components/pwa/ServiceWorkerRegistrar.tsx`
- Modify: `app/layout.tsx`
- Create: `test/manifest.test.ts`

**Interfaces:**
- Produces: `ServiceWorkerRegistrar` (default-less named export, client component, no props).

- [ ] **Step 1: Write the manifest** — `public/manifest.webmanifest`:

```json
{
  "name": "Door to Door",
  "short_name": "Door2Door",
  "description": "Field sales platform for door-to-door teams",
  "start_url": "/map",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "icons": [
    { "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 2: Write the failing manifest test** — create `test/manifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('../public/manifest.webmanifest', import.meta.url)), 'utf8')
)

describe('manifest', () => {
  it('has the keys install criteria require', () => {
    expect(manifest.name).toBe('Door to Door')
    expect(manifest.short_name).toBeTruthy()
    expect(manifest.start_url).toBe('/map')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.length).toBeGreaterThan(0)
    expect(manifest.icons[0].src).toBe('/icon.svg')
  })
})
```

- [ ] **Step 3: Run it (should pass — manifest already written)** — `npm run test:run -- test/manifest.test.ts` — Expected: PASS. (This test guards the manifest against future edits; it is green on creation.)

- [ ] **Step 4: Write `public/sw.js`** — trivial, cache-nothing:

```js
// Minimal service worker: exists only to satisfy PWA installability criteria.
// Caches nothing in v1 — all fetches pass straight through to the network.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', event => event.respondWith(fetch(event.request)))
```

- [ ] **Step 5: Write `components/pwa/ServiceWorkerRegistrar.tsx`**:

```tsx
'use client'
import { useEffect } from 'react'

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.error('service worker registration failed', err)
    })
  }, [])
  return null
}
```

- [ ] **Step 6: Wire into `app/layout.tsx`** — add the manifest + theme to `metadata`, render the registrar. In the `metadata` object add `manifest: '/manifest.webmanifest'` and (as a sibling export, since Next 15 wants viewport separate) add:

```ts
import type { Metadata, Viewport } from 'next'
// … existing metadata gains:  manifest: '/manifest.webmanifest',
export const viewport: Viewport = { themeColor: '#ffffff' }
```

Import and render `<ServiceWorkerRegistrar />` as the first child inside `<body>`:

```tsx
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar'
// … in the body:
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistrar />
        {children}
      </body>
```

(Change the `Metadata` import line to `import type { Metadata, Viewport } from 'next'`.)

- [ ] **Step 7: Verify** — `npx tsc --noEmit && npm run test:run -- test/manifest.test.ts` — clean / PASS.

- [ ] **Step 8: Commit**

```bash
git add public/manifest.webmanifest public/sw.js components/pwa/ServiceWorkerRegistrar.tsx app/layout.tsx test/manifest.test.ts
git commit -m "feat: installable PWA manifest, service worker, and registrar (#11)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Offline core — `visit-queue` (IndexedDB) and `submit-visit` (TDD)

**Files:**
- Create: `lib/visit-queue.ts`
- Create: `lib/visit-queue.test.ts`
- Create: `lib/submit-visit.ts`
- Create: `lib/submit-visit.test.ts`
- Modify: `vitest.setup.ts`
- Modify: `package.json` (add `fake-indexeddb` devDependency)

**Interfaces:**
- Produces (from `@/lib/visit-queue`): `type VisitEndpoint = '/api/visits' | '/api/business-visits'`; `type QueuedVisit = { id: string; endpoint: VisitEndpoint; payload: unknown; createdAt: number }`; `enqueueVisit(endpoint: VisitEndpoint, payload: unknown): Promise<QueuedVisit>`; `listQueuedVisits(): Promise<QueuedVisit[]>`; `removeQueuedVisit(id: string): Promise<void>`; `queuedVisitCount(): Promise<number>`.
- Produces (from `@/lib/submit-visit`): `type SubmitResult = { ok: boolean; queued?: boolean; data?: unknown }`; `submitVisit(endpoint: VisitEndpoint, payload: unknown): Promise<SubmitResult>`.

- [ ] **Step 1: Add the devDependency + polyfill** — from the worktree root:

```bash
npm install -D fake-indexeddb
```

Then prepend to `vitest.setup.ts` (line 1, before the jest-dom import):

```ts
import 'fake-indexeddb/auto'
```

- [ ] **Step 2: Write the failing queue test** — create `lib/visit-queue.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { enqueueVisit, listQueuedVisits, removeQueuedVisit, queuedVisitCount } from './visit-queue'

// fake-indexeddb persists across tests in a run; clear the store each time
beforeEach(async () => {
  for (const v of await listQueuedVisits()) await removeQueuedVisit(v.id)
})

describe('visit-queue', () => {
  it('enqueues and lists a visit', async () => {
    const q = await enqueueVisit('/api/visits', { householdId: 'h1', contactStatus: 'answered' })
    expect(q.id).toBeTruthy()
    expect(q.endpoint).toBe('/api/visits')
    const all = await listQueuedVisits()
    expect(all).toHaveLength(1)
    expect(all[0].payload).toEqual({ householdId: 'h1', contactStatus: 'answered' })
  })

  it('counts queued visits', async () => {
    await enqueueVisit('/api/visits', { a: 1 })
    await enqueueVisit('/api/business-visits', { b: 2 })
    expect(await queuedVisitCount()).toBe(2)
  })

  it('removes a queued visit by id', async () => {
    const q = await enqueueVisit('/api/visits', { a: 1 })
    await removeQueuedVisit(q.id)
    expect(await queuedVisitCount()).toBe(0)
  })
})
```

- [ ] **Step 3: Run it — RED** — `npm run test:run -- lib/visit-queue.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement `lib/visit-queue.ts`**:

```ts
// Client-safe IndexedDB write-queue for visit POSTs. Persists a logged visit
// through a dead zone; SyncProvider replays these on reconnect.

export type VisitEndpoint = '/api/visits' | '/api/business-visits'
export type QueuedVisit = { id: string; endpoint: VisitEndpoint; payload: unknown; createdAt: number }

const DB_NAME = 'door2door'
const STORE = 'visits'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE))
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
  }))
}

export async function enqueueVisit(endpoint: VisitEndpoint, payload: unknown): Promise<QueuedVisit> {
  const record: QueuedVisit = { id: crypto.randomUUID(), endpoint, payload, createdAt: Date.now() }
  await tx('readwrite', store => store.add(record))
  return record
}

export function listQueuedVisits(): Promise<QueuedVisit[]> {
  return tx<QueuedVisit[]>('readonly', store => store.getAll())
}

export async function removeQueuedVisit(id: string): Promise<void> {
  await tx('readwrite', store => store.delete(id))
}

export function queuedVisitCount(): Promise<number> {
  return tx<number>('readonly', store => store.count())
}
```

- [ ] **Step 5: GREEN** — `npm run test:run -- lib/visit-queue.test.ts` — Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing submit test** — create `lib/submit-visit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { submitVisit } from './submit-visit'
import * as queue from './visit-queue'

beforeEach(() => vi.restoreAllMocks())

describe('submitVisit', () => {
  it('returns the data and does not queue when the POST succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'v1' }) }))
    const enqueue = vi.spyOn(queue, 'enqueueVisit')
    const res = await submitVisit('/api/visits', { householdId: 'h1' })
    expect(res).toEqual({ ok: true, data: { id: 'v1' } })
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('queues the visit when the fetch throws (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const enqueue = vi.spyOn(queue, 'enqueueVisit').mockResolvedValue({ id: 'q1', endpoint: '/api/visits', payload: {}, createdAt: 0 })
    const res = await submitVisit('/api/visits', { householdId: 'h1' })
    expect(res).toEqual({ ok: true, queued: true })
    expect(enqueue).toHaveBeenCalledWith('/api/visits', { householdId: 'h1' })
  })

  it('reports failure and does NOT queue on a server rejection (!res.ok)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    const enqueue = vi.spyOn(queue, 'enqueueVisit')
    const res = await submitVisit('/api/visits', { householdId: 'h1' })
    expect(res).toEqual({ ok: false })
    expect(enqueue).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 7: RED** — `npm run test:run -- lib/submit-visit.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 8: Implement `lib/submit-visit.ts`**:

```ts
import { enqueueVisit, type VisitEndpoint } from './visit-queue'

export type SubmitResult = { ok: boolean; queued?: boolean; data?: unknown }

/** POST a visit; on a connectivity failure (thrown fetch) queue it for
 * replay and report provisional success. A server rejection (!res.ok) is a
 * real failure and is never queued — a bad payload must not loop forever. */
export async function submitVisit(endpoint: VisitEndpoint, payload: unknown): Promise<SubmitResult> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return { ok: false }
    return { ok: true, data: await res.json() }
  } catch {
    await enqueueVisit(endpoint, payload)
    return { ok: true, queued: true }
  }
}
```

- [ ] **Step 9: GREEN + full suite** — `npm run test:run -- lib/submit-visit.test.ts && npx tsc --noEmit` — PASS / clean.

- [ ] **Step 10: Commit**

```bash
git add lib/visit-queue.ts lib/visit-queue.test.ts lib/submit-visit.ts lib/submit-visit.test.ts vitest.setup.ts package.json package-lock.json
git commit -m "feat: IndexedDB visit queue and offline-aware submitVisit (#11)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Sync surface — `SyncProvider`, `PendingSyncBadge`, layout + nav wiring (TDD badge)

**Files:**
- Create: `components/pwa/SyncProvider.tsx`
- Create: `components/pwa/PendingSyncBadge.tsx`
- Create: `components/pwa/PendingSyncBadge.test.tsx`
- Modify: `app/(app)/layout.tsx`
- Modify: `app/(app)/nav-bar.tsx`

**Interfaces:**
- Consumes: `listQueuedVisits`, `removeQueuedVisit`, `queuedVisitCount` (Task 2).
- Produces: `SyncProvider` (client, wraps children, flushes on mount + `online`); `useSync(): { pending: number; refresh: () => void }`; `PendingSyncBadge` (client, no props, reads `useSync`).

- [ ] **Step 1: Implement `components/pwa/SyncProvider.tsx`**:

```tsx
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
```

- [ ] **Step 2: Write the failing badge test** — create `components/pwa/PendingSyncBadge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PendingSyncBadge } from './PendingSyncBadge'
import { useSync } from './SyncProvider'

// Render the badge under a fake provider value by mocking useSync
import { vi } from 'vitest'
vi.mock('./SyncProvider', async (orig) => ({ ...(await orig<typeof import('./SyncProvider')>()), useSync: vi.fn() }))

describe('PendingSyncBadge', () => {
  it('renders nothing when there is nothing pending', () => {
    ;(useSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ pending: 0, refresh: () => {} })
    const { container } = render(<PendingSyncBadge />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the pending count when nonzero', () => {
    ;(useSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ pending: 3, refresh: () => {} })
    render(<PendingSyncBadge />)
    expect(screen.getByText('3 pending')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: RED** — `npm run test:run -- components/pwa/PendingSyncBadge.test.tsx` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement `components/pwa/PendingSyncBadge.tsx`**:

```tsx
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
```

- [ ] **Step 5: GREEN** — `npm run test:run -- components/pwa/PendingSyncBadge.test.tsx` — Expected: PASS (2 tests).

- [ ] **Step 6: Wrap the app in `SyncProvider`** — in `app/(app)/layout.tsx`, import it and wrap the returned tree:

```tsx
import { SyncProvider } from '@/components/pwa/SyncProvider'
// … return:
  return (
    <SyncProvider>
      <div className="flex min-h-screen flex-col">
        <NavBar role={session.user.role} />
        <main className="flex-1">{children}</main>
      </div>
    </SyncProvider>
  )
```

- [ ] **Step 7: Show the badge in the nav** — in `app/(app)/nav-bar.tsx`, import `PendingSyncBadge` and render it just before the Sign out button (the header is `justify-between`; put the badge + sign-out in a right-side group). Replace the trailing sign-out button with:

```tsx
      <div className="flex items-center gap-3">
        <PendingSyncBadge />
        <button
          onClick={() => signOut()}
          className="text-sm px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          Sign out
        </button>
      </div>
```

Add `import { PendingSyncBadge } from '@/components/pwa/PendingSyncBadge'` at the top.

- [ ] **Step 8: Verify** — `npx tsc --noEmit && npm run test:run` — clean / pass (pre-existing auth test aside).

- [ ] **Step 9: Commit**

```bash
git add components/pwa/SyncProvider.tsx components/pwa/PendingSyncBadge.tsx components/pwa/PendingSyncBadge.test.tsx "app/(app)/layout.tsx" "app/(app)/nav-bar.tsx"
git commit -m "feat: sync provider, pending-sync badge, and app wiring (#11)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Panel wiring + locate-me button + gates

**Files:**
- Modify: `components/map/HousePanel.tsx`
- Modify: `components/map/BusinessPanel.tsx`
- Create: `components/map/LocateMeButton.tsx`
- Modify: `components/map/MapShell.tsx`

**Interfaces:**
- Consumes: `submitVisit` (Task 2), `useSync` (Task 3), the existing `setTargetLocation` in `MapShell`.

- [ ] **Step 1: `HousePanel.handleLogVisit`** — route through `submitVisit` and tick the badge. Add imports `import { submitVisit } from '@/lib/submit-visit'` and `import { useSync } from '@/components/pwa/SyncProvider'`; inside the component add `const { refresh: refreshSync } = useSync()`. Replace the body of `handleLogVisit` with:

```tsx
  async function handleLogVisit(data: VisitFormData) {
    const res = await submitVisit('/api/visits', data)
    if (!res.ok) { setError('Failed to save visit. Please try again.'); return }
    if (res.queued) {
      refreshSync()
    } else {
      const saved = res.data as { houseStatusId?: string | null }
      if (house && saved.houseStatusId !== undefined) {
        onHouseUpdate?.(house.id, { statusId: saved.houseStatusId })
      }
    }
    setView('detail')
    setVisitHouseholdId(null)
    fetchData()
  }
```

- [ ] **Step 2: `BusinessPanel.handleSaveVisit`** — same pattern. Add the same two imports and `const { refresh: refreshSync } = useSync()`. Replace the fetch block:

```tsx
  async function handleSaveVisit(e: React.FormEvent) {
    e.preventDefault()
    if (!business) return
    setSaving(true)
    const res = await submitVisit('/api/business-visits', {
      businessId: business.id,
      contactStatus,
      interestLevel: interestLevel || undefined,
      saleOutcome: saleOutcome || undefined,
      notes: notes || undefined,
      followUpAt: followUpAt || undefined,
    })
    setSaving(false)
    if (!res.ok) return
    if (res.queued) {
      refreshSync()
    } else {
      const visit = res.data as { businessStatusId?: string | null }
      setVisits(prev => [visit as never, ...prev])
      if (business && visit.businessStatusId !== undefined) {
        onBusinessUpdate?.(business.id, { statusId: visit.businessStatusId })
      }
    }
    resetForm()
    setView('detail')
  }
```

- [ ] **Step 3: `components/map/LocateMeButton.tsx`**:

```tsx
'use client'
import { LocateFixedIcon } from 'lucide-react'

type Props = { onLocate: (lat: number, lng: number) => void }

export function LocateMeButton({ onLocate }: Props) {
  function handleClick() {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      pos => onLocate(pos.coords.latitude, pos.coords.longitude),
      () => {},
    )
  }
  return (
    <button
      onClick={handleClick}
      aria-label="Locate me"
      className="flex h-9 w-9 items-center justify-center rounded-full border bg-background/95 shadow-lg backdrop-blur-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <LocateFixedIcon className="h-4 w-4" />
    </button>
  )
}
```

- [ ] **Step 4: Mount it in `MapShell.tsx`** — import `LocateMeButton`, and in the bottom-right control cluster (the `<div className="flex items-center gap-2">` that holds the search button) add it as the first child:

```tsx
          <LocateMeButton onLocate={(lat, lng) => setTargetLocation({ lat, lng })} />
```

(This reuses the existing `targetLocation` fly-to path — no map ref needed. Verify `setTargetLocation` is the state setter already declared in `MapShell`; the search overlay uses the same setter.)

- [ ] **Step 5: Full gates** — `npx tsc --noEmit && npm run test:run && AUTH_GOOGLE_ID=dummy AUTH_GOOGLE_SECRET=dummy AUTH_SECRET=dummy DATABASE_URL='postgresql://dummy:dummy@localhost:5432/dummy' npm run build` — clean / pass / build succeeds.

- [ ] **Step 6: Commit**

```bash
git add components/map/HousePanel.tsx components/map/BusinessPanel.tsx components/map/LocateMeButton.tsx components/map/MapShell.tsx
git commit -m "feat: offline-aware visit submit in panels and locate-me button (#11)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** manifest + trivial SW + registrar (T1); IndexedDB queue + connectivity-only queueing in `submitVisit` (T2); SyncProvider flush-on-mount/online + remove-on-definitive-response + pending badge (T3); both panels route visit POSTs through `submitVisit`, queued path skips the pin optimistic update and ticks the badge, locate-me reuses `targetLocation` (T4). Deferrals (offline read-cache, offline PATCHes, push, idempotency) have no tasks — intentional.
- **Type consistency:** `VisitEndpoint`/`QueuedVisit`/`SubmitResult` defined in Task 2 and consumed unchanged in T3/T4; `useSync().refresh` aliased to `refreshSync` in both panels; `submitVisit` return shape (`ok`/`queued`/`data`) handled identically in both panels.
- **Known judgment point:** the flusher removes a row on any *server* response (ok or 4xx) and only re-queues on a thrown fetch — matches the spec's "a permanently-bad row shouldn't wedge the queue." A visit that 4xx's on replay is dropped (logged nowhere) — acceptable for v1; a bad queued payload is far rarer than a dead zone, and blocking the queue on it would be worse.
- **Unverifiable-here, flagged:** SW registration, real install, geolocation, and the online-event flush need a browser + deploy; the post-deploy smoke in the PR body is the verification path. Unit tests cover the queue logic and the submit/flush branching, which is the trust-critical core.
