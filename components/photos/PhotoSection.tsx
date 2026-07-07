'use client'
import { useState, useEffect, useRef } from 'react'
import { CameraIcon, Trash2Icon } from 'lucide-react'
import { canDeleteNote } from '@/lib/permissions'
import { photoUrl, downscaleImage } from '@/lib/photos'

export type PhotoMeta = { id: string; userId: string | null; createdAt: string; authorName: string }

type Props = {
  entity: 'house' | 'business'
  entityId: string | null
  currentUser: { id: string; role: string }
}

export function PhotoSection({ entity, entityId, currentUser }: Props) {
  const [photos, setPhotos] = useState<PhotoMeta[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const entityKey = entity === 'house' ? 'houseId' : 'businessId'

  useEffect(() => {
    setPhotos([])
    setError(null)
    if (!entityId) return
    const controller = new AbortController()
    fetch(`/api/${entity}-photos?${entityKey}=${entityId}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('load failed')))
      .then(setPhotos)
      .catch(e => { if ((e as Error)?.name !== 'AbortError') setError('Failed to load photos.') })
    return () => controller.abort()
  }, [entity, entityKey, entityId])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !entityId) return
    setError(null)
    setUploading(true)
    try {
      const blob = await downscaleImage(file)
      const res = await fetch(`/api/${entity}-photos?${entityKey}=${entityId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      })
      if (!res.ok) throw new Error('upload failed')
      const { id } = await res.json()
      setPhotos(prev => [
        { id, userId: currentUser.id, createdAt: new Date().toISOString(), authorName: 'You' },
        ...prev,
      ])
    } catch {
      setError('Failed to upload photo. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: string) {
    const removed = photos.find(p => p.id === id)
    if (!removed) return
    setError(null)
    setPhotos(prev => prev.filter(p => p.id !== id))
    try {
      const res = await fetch(photoUrl(entity, id), { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
    } catch {
      setPhotos(prev => [removed, ...prev])
      setError('Failed to delete photo. Please try again.')
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          aria-label="Add photo"
          disabled={uploading || !entityId}
          onClick={() => inputRef.current?.click()}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <CameraIcon className="h-5 w-5" />
          {uploading ? 'Uploading…' : 'Add photo'}
        </button>
        {photos.map(p => (
          <div key={p.id} className="relative aspect-square">
            <a href={photoUrl(entity, p.id)} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl(entity, p.id)}
                alt={`Photo by ${p.authorName}`}
                loading="lazy"
                className="h-full w-full rounded-xl border object-cover"
              />
            </a>
            {canDeleteNote(currentUser, p) && (
              <button
                type="button"
                aria-label={`Delete photo by ${p.authorName}`}
                onClick={() => handleDelete(p.id)}
                className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-muted-foreground hover:text-destructive"
              >
                <Trash2Icon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Photo file"
        onChange={handleFile}
      />
    </div>
  )
}
