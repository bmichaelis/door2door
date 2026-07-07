// Client-safe photo helpers — must never import server-only code (db, auth, bindings)

export function photoUrl(entity: 'house' | 'business', id: string): string {
  return `/api/${entity}-photos/${id}`
}

/** Downscale and re-encode to JPEG before upload. Re-encoding via canvas also
 * strips EXIF metadata, including GPS. jsdom has no canvas — exercised in the
 * browser, not unit tests. */
export async function downscaleImage(file: File, maxEdge = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('encode failed')), 'image/jpeg', quality)
  })
}
