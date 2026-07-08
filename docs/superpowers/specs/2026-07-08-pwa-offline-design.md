# PWA + Offline-Tolerant Visit Logging — Design

**Issue:** #11 · **Date:** 2026-07-08 · **Status:** Approved (scope decided
with the user: lean phase — installable + write-queue; offline browsing and
offline PATCHes deferred).

Make the app installable to the home screen and guarantee a logged visit is
never lost in a dead zone. A dropped connection mid-visit currently throws
silently; after this, the visit is queued in IndexedDB and replayed on
reconnect.

## Scope decisions (with rationale)

- **Queue visit *creates* only** — not status/tag/note/appointment PATCHes.
  Visit inserts are append-only: safe to replay in any order, no conflict.
  PATCHes carry stale-write/ordering risk not worth it for convenience-tier
  data. Offline PATCH queueing → follow-up.
- **A queued visit is invisible in the panel's visit-history list until it
  syncs** (history is server-sourced). The rep's trust need — "my knock is
  saved" — is met by a global pending-sync indicator, not by merging local
  and server state into the history list.
- **Service worker is deliberately trivial** — install/activate + a
  network-passthrough `fetch` handler, caching nothing. Chrome's install
  criteria require a registered SW with a fetch handler; that's its only
  job. The write-queue is app-level and SW-independent, so if the SW fails
  to register under next-on-pages, only installability is affected — never
  offline visit logging.
- **Reconnect-flush, not Background Sync** — iOS Safari has no Background
  Sync; flushing on the `online` event and on app mount is portable and
  needs no SW.

## Components

- `public/manifest.webmanifest` — name, short_name, `display: standalone`,
  `theme_color`, `background_color`, start_url `/map`, icons from the
  existing `icon.svg` (any-maskable). Linked via `app/layout.tsx` metadata
  (`manifest` + `themeColor`, `appleWebApp` for iOS standalone).
- `public/sw.js` — `self.addEventListener('install', …skipWaiting)`,
  `activate` (…clients.claim), `fetch` → `e.respondWith(fetch(e.request))`
  passthrough. No caching in v1.
- `components/pwa/ServiceWorkerRegistrar.tsx` (`'use client'`) — registers
  `/sw.js` on mount when `'serviceWorker' in navigator`; failures logged,
  never thrown. Rendered once in `app/layout.tsx`.
- `lib/visit-queue.ts` (client-safe, IndexedDB) — `type QueuedVisit = { id:
  string; endpoint: '/api/visits' | '/api/business-visits'; payload:
  unknown; createdAt: number }`; `enqueueVisit(endpoint, payload)`,
  `listQueuedVisits()`, `removeQueuedVisit(id)`, `queuedVisitCount()`. One
  object store `visits` keyed by `id` (crypto.randomUUID).
- `lib/submit-visit.ts` (client-safe) — `submitVisit(endpoint, payload):
  Promise<{ ok: boolean; queued?: boolean; data?: unknown }>`: `fetch` the
  POST; on `res.ok` → `{ ok: true, data }`; on a thrown fetch (offline/
  network) → `enqueueVisit` then `{ ok: true, queued: true }`; on `!res.ok`
  (server rejected — a real 4xx/5xx, not connectivity) → `{ ok: false }`
  (NOT queued; a bad payload would loop forever). Both panels call this.
- `components/pwa/SyncProvider.tsx` (`'use client'`) — mounted in
  `app/(app)/layout.tsx`; on mount and on `window` `online`, drains the
  queue (POST each `endpoint`+`payload`; `removeQueuedVisit` on `res.ok` or
  a 4xx — a permanently-bad row shouldn't wedge the queue; keep on network
  failure). Exposes `{ pending: number; refresh: () => void }` via context.
- `components/pwa/PendingSyncBadge.tsx` — reads the context; renders "N
  pending" chip in the nav bar; nothing at zero.
- `components/map/LocateMeButton.tsx` — `navigator.geolocation
  .getCurrentPosition` → `flyTo`; a button in the map's bottom-right control
  cluster (near search). Permission denial: silent no-op.

## Panel wiring

`HousePanel.handleLogVisit` and `BusinessPanel.handleSaveVisit` replace their
inline `fetch` with `submitVisit(...)`:
- `{ ok: true, queued: true }` → close the form to detail, trigger a
  SyncProvider `refresh()` (badge ticks up); skip the status-pin optimistic
  update (no server response to read) — it self-heals after flush + refetch.
- `{ ok: true, data }` → today's behavior (pin update, refetch).
- `{ ok: false }` → today's error banner.

## Error handling

- SW registration, geolocation, and queue flush all fail silently/logged —
  none can break the app.
- Known limitation (documented): a POST that succeeded server-side but whose
  response was lost will replay and double-insert on reconnect (visits have
  no dedupe key). Losing a visit is far worse than a rare duplicate;
  server-side idempotency is out of scope.

## Testing

- `lib/submit-visit.test.ts`: injected fetch — resolves-ok → not queued;
  throws → enqueued + `{queued:true}`; resolves-!ok → `{ok:false}`, not
  enqueued (mock `@/lib/visit-queue`).
- `lib/visit-queue.test.ts`: against `fake-indexeddb/auto` (new test-only
  devDependency; polyfilled in `vitest.setup.ts`) — enqueue→list→remove→
  count round-trip.
- `PendingSyncBadge` component test (zero → hidden, N → shown).
- Manifest is valid JSON with required keys.
- SW registration + real installability + geolocation: **post-deploy smoke**
  (unverifiable pre-merge — no SW/geolocation in the test env).

## Out of scope (follow-ups)

Offline API read-caching for map browsing; offline PATCH mutations (status/
tags/notes/appointments); push notifications; server-side visit idempotency.
