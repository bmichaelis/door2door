import { getRequestContext } from '@cloudflare/next-on-pages'

// Minimal structural type for the three R2 operations we use — avoids a
// dependency on @cloudflare/workers-types for three signatures.
export type R2Bucket = {
  put(key: string, value: ArrayBuffer | ReadableStream, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  get(key: string): Promise<{ body: ReadableStream } | null>
  delete(key: string): Promise<void>
}

/** The PHOTOS R2 binding, or null when running outside the Pages runtime
 * (plain `next dev`) or before the binding/bucket exists. Callers 503. */
export function getPhotosBucket(): R2Bucket | null {
  try {
    const env = getRequestContext().env as { PHOTOS?: R2Bucket }
    return env.PHOTOS ?? null
  } catch {
    return null
  }
}
