'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  houseId: string
  onSubmit: (data: { houseId: string; surname: string; headOfHouseholdName: string }) => Promise<void>
  onCancel: () => void
}

export function HouseholdForm({ houseId, onSubmit, onCancel }: Props) {
  const [surname, setSurname] = useState('')
  const [head, setHead] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await onSubmit({ houseId, surname, headOfHouseholdName: head })
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Creating a new household will archive the current family's visit history.
      </p>
      <div>
        <Label>Family Surname</Label>
        <Input value={surname} onChange={e => setSurname(e.target.value)} placeholder="e.g. Smith" />
      </div>
      <div>
        <Label>Head of Household</Label>
        <Input value={head} onChange={e => setHead(e.target.value)} placeholder="e.g. John Smith" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? 'Saving...' : 'Create New Household'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
