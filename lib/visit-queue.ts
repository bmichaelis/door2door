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
