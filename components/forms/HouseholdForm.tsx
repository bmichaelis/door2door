'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  houseId: string
  onSubmit: (data: { houseId: string; surname: string; headOfHouseholdName: string; spouseName: string }) => Promise<void>
  onCancel: () => void
}

export function HouseholdForm({ houseId, onSubmit, onCancel }: Props) {
  const [surname, setSurname] = useState('')
  const [head, setHead] = useState('')
  const [spouse, setSpouse] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await onSubmit({ houseId, surname, headOfHouseholdName: head, spouseName: spouse })
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
        <Label>Head of Household First Name</Label>
        <Input value={head} onChange={e => setHead(e.target.value)} placeholder="e.g. John" />
      </div>
      <div>
        <Label>Spouse First Name <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input value={spouse} onChange={e => setSpouse(e.target.value)} placeholder="e.g. Jane" />
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
