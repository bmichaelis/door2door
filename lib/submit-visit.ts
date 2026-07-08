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
