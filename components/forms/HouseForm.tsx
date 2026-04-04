'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  lat: number
  lng: number
  onSubmit: (address: string) => Promise<void>
  onCancel: () => void
}

export function HouseForm({ lat, lng, onSubmit, onCancel }: Props) {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!address.trim()) return
    setLoading(true)
    await onSubmit(address.trim())
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pin dropped at {lat.toFixed(5)}, {lng.toFixed(5)}
      </p>
      <div>
        <Label>Street Address</Label>
        <Input
          value={address}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddress(e.target.value)}
          placeholder="123 Main St, City, ST 12345"
          autoFocus
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={loading || !address.trim()} className="flex-1">
          {loading ? 'Adding...' : 'Add House'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
