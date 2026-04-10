'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

type Product = { id: string; name: string }

type Props = {
  householdId: string
  products: Product[]
  onSubmit: (data: VisitFormData) => Promise<void>
  onCancel: () => void
}

export type VisitFormData = {
  householdId: string
  contactStatus: 'answered' | 'not_home' | 'refused'
  interestLevel?: 'interested' | 'not_interested' | 'maybe'
  notes?: string
  followUpAt?: string
  saleOutcome?: 'sold' | 'not_sold' | 'follow_up'
  productId?: string
  installDate?: string
  serviceDate?: string
}

export function VisitForm({ householdId, products, onSubmit, onCancel }: Props) {
  const [contactStatus, setContactStatus] = useState<VisitFormData['contactStatus']>('answered')
  const [interestLevel, setInterestLevel] = useState<string>('')
  const [saleOutcome, setSaleOutcome] = useState<string>('')
  const [productId, setProductId] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [followUpAt, setFollowUpAt] = useState('')
  const [installDate, setInstallDate] = useState('')
  const [serviceDate, setServiceDate] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await onSubmit({
      householdId,
      contactStatus,
      interestLevel: interestLevel as VisitFormData['interestLevel'] || undefined,
      notes: notes || undefined,
      followUpAt: followUpAt || undefined,
      saleOutcome: saleOutcome as VisitFormData['saleOutcome'] || undefined,
      productId: productId || undefined,
      installDate: installDate || undefined,
      serviceDate: serviceDate || undefined,
    })
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Contact Status</Label>
        <Select value={contactStatus} onValueChange={v => setContactStatus(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="answered">Answered</SelectItem>
            <SelectItem value="not_home">Not Home</SelectItem>
            <SelectItem value="refused">Refused</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {contactStatus === 'answered' && (
        <>
          <div>
            <Label>Interest Level</Label>
            <Select value={interestLevel} onValueChange={v => setInterestLevel(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="interested">Interested</SelectItem>
                <SelectItem value="maybe">Maybe</SelectItem>
                <SelectItem value="not_interested">Not Interested</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sale Outcome</Label>
            <Select value={saleOutcome} onValueChange={v => setSaleOutcome(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sold">Sold</SelectItem>
                <SelectItem value="not_sold">Not Sold</SelectItem>
                <SelectItem value="follow_up">Follow Up</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {saleOutcome === 'sold' && (
            <>
              <div>
                <Label>Product</Label>
                <Select value={productId} onValueChange={v => setProductId(v ?? '')}>
                  <SelectTrigger><SelectValue placeholder="Select product..." /></SelectTrigger>
                  <SelectContent>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Install Date</Label>
                <Input type="date" value={installDate} onChange={e => setInstallDate(e.target.value)} />
              </div>
              <div>
                <Label>Service Date</Label>
                <Input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)} />
              </div>
            </>
          )}
        </>
      )}
      <div>
        <Label>Notes</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
      </div>
      <div>
        <Label>Follow-up Date</Label>
        <Input type="datetime-local" value={followUpAt} onChange={e => setFollowUpAt(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? 'Saving...' : 'Log Visit'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
