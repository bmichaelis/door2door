'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

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

function OptionGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; color?: string }[]
  value: T | ''
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-2">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-xl border py-2.5 text-sm font-medium transition-all',
            value === o.value
              ? o.color ?? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background text-foreground hover:bg-muted'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
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

  const answered = contactStatus === 'answered'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</Label>
        <OptionGroup
          options={[
            { value: 'answered', label: 'Answered' },
            { value: 'not_home', label: 'Not Home' },
            { value: 'refused', label: 'Refused', color: 'border-destructive/40 bg-destructive/10 text-destructive' },
          ]}
          value={contactStatus}
          onChange={v => { setContactStatus(v); setInterestLevel(''); setSaleOutcome('') }}
        />
      </div>

      {answered && (
        <>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interest</Label>
            <OptionGroup
              options={[
                { value: 'interested', label: 'Interested', color: 'border-green-500/40 bg-green-50 text-green-700' },
                { value: 'maybe', label: 'Maybe', color: 'border-yellow-500/40 bg-yellow-50 text-yellow-700' },
                { value: 'not_interested', label: 'Not Interested', color: 'border-destructive/40 bg-destructive/10 text-destructive' },
              ]}
              value={interestLevel}
              onChange={setInterestLevel}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outcome</Label>
            <OptionGroup
              options={[
                { value: 'sold', label: 'Sold', color: 'border-green-500/40 bg-green-50 text-green-700' },
                { value: 'follow_up', label: 'Follow Up', color: 'border-blue-500/40 bg-blue-50 text-blue-700' },
                { value: 'not_sold', label: 'Not Sold', color: 'border-destructive/40 bg-destructive/10 text-destructive' },
              ]}
              value={saleOutcome}
              onChange={setSaleOutcome}
            />
          </div>

          {saleOutcome === 'sold' && products.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Product</Label>
              <Select value={productId} onValueChange={v => setProductId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Select product..." /></SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {saleOutcome === 'sold' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Install Date</Label>
                <Input type="date" value={installDate} onChange={e => setInstallDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Service Date</Label>
                <Input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)} />
              </div>
            </div>
          )}
        </>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..." />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Follow-up Date</Label>
        <Input type="datetime-local" value={followUpAt} onChange={e => setFollowUpAt(e.target.value)} />
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? 'Saving…' : 'Save Visit'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
