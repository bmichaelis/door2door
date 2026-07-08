// Minimal service worker: exists only to satisfy PWA installability criteria.
// Caches nothing in v1 — all fetches pass straight through to the network.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', event => event.respondWith(fetch(event.request)))
