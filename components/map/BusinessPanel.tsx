'use client'
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { BusinessRow } from './BusinessPins'
import { PhoneIcon, GlobeIcon, MapPinIcon } from 'lucide-react'
import { StatusChips } from './StatusChips'
import type { StatusOption } from '@/lib/statuses'
import { TagEditor } from './TagEditor'
import { NotesSection } from './NotesSection'
import { useTags } from './useTags'
import { useNotes } from './useNotes'
import { AppointmentForm } from '@/components/appointments/AppointmentForm'
import { PhotoSection } from '@/components/photos/PhotoSection'
import { submitVisit } from '@/lib/submit-visit'
import { useSync } from '@/components/pwa/SyncProvider'

type Visit = {
  id: string
  contactStatus: string
  interestLevel: string | null
  saleOutcome: string | null
  notes: string | null
  createdAt: string
}

type Product = { id: string; name: string }

type Props = {
  business: BusinessRow | null
  statuses: StatusOption[]
  currentUser: { id: string; role: string }
  onClose: () => void
  onBusinessUpdate?: (id: string, updates: Partial<BusinessRow>) => void
}

function OptionGroup<T extends string>({
  options, value, onChange,
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

const CONTACT_LABEL: Record<string, string> = {
  answered: 'Spoke to Someone',
  not_home: 'Closed / Not Available',
  refused: 'Refused',
}

const OUTCOME_STYLES: Record<string, string> = {
  sold: 'bg-green-100 text-green-800',
  follow_up: 'bg-blue-100 text-blue-800',
  not_sold: 'bg-red-100 text-red-800',
}

export function BusinessPanel({ business, statuses, currentUser, onClose, onBusinessUpdate }: Props) {
  const { refresh: refreshSync } = useSync()
  const [view, setView] = useState<'detail' | 'log-visit' | 'book-appointment'>('detail')
  const [visits, setVisits] = useState<Visit[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [statusError, setStatusError] = useState<string | null>(null)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [bookError, setBookError] = useState<string | null>(null)

  const { tags, attach: attachTag, remove: removeTag, error: tagError } = useTags('business-tags', 'businessId', business?.id ?? null)
  const { notes: bizNotes, add: addNote, removeNote, error: noteError, busy: noteBusy } = useNotes('business-notes', 'businessId', business?.id ?? null)

  // Visit form state
  const [contactStatus, setContactStatus] = useState<'answered' | 'not_home' | 'refused'>('answered')
  const [interestLevel, setInterestLevel] = useState('')
  const [saleOutcome, setSaleOutcome] = useState('')
  const [notes, setNotes] = useState('')
  const [followUpAt, setFollowUpAt] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!business) { setView('detail'); return }
    setView('detail')
    setVisits([])
    setStatusError(null)
    setBookError(null)
    fetch(`/api/business-visits?businessId=${business.id}`)
      .then(r => r.json())
      .then(setVisits)
      .catch(() => {})
    fetch('/api/products')
      .then(r => r.json())
      .then(setProducts)
      .catch(() => {})
  }, [business?.id])

  function resetForm() {
    setContactStatus('answered')
    setInterestLevel('')
    setSaleOutcome('')
    setNotes('')
    setFollowUpAt('')
  }

  async function handleStatusSelect(statusId: string | null) {
    if (!business) return
    const previous = business.statusId
    setStatusError(null)
    setStatusUpdating(true)
    onBusinessUpdate?.(business.id, { statusId })
    try {
      const res = await fetch(`/api/businesses/${business.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusId }),
      })
      if (!res.ok) throw new Error('status update failed')
    } catch {
      onBusinessUpdate?.(business.id, { statusId: previous })
      setStatusError('Failed to update status. Please try again.')
    } finally {
      setStatusUpdating(false)
    }
  }

  async function handleBookAppointment(data: { scheduledAt: string; notes?: string }) {
    if (!business) return
    setBookError(null)
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: business.id, ...data }),
      })
      if (!res.ok) throw new Error('booking failed')
      setView('detail')
    } catch {
      setBookError('Failed to book appointment. Please try again.')
    }
  }

  async function handleSaveVisit(e: React.FormEvent) {
    e.preventDefault()
    if (!business) return
    setSaving(true)
    const res = await submitVisit('/api/business-visits', {
      businessId: business.id,
      contactStatus,
      interestLevel: interestLevel || undefined,
      saleOutcome: saleOutcome || undefined,
      notes: notes || undefined,
      followUpAt: followUpAt || undefined,
    })
    setSaving(false)
    if (!res.ok) return
    if (res.queued) {
      refreshSync()
    } else {
      const visit = res.data as { businessStatusId?: string | null }
      setVisits(prev => [visit as never, ...prev])
      if (business && visit.businessStatusId !== undefined) {
        onBusinessUpdate?.(business.id, { statusId: visit.businessStatusId })
      }
    }
    resetForm()
    setView('detail')
  }

  const address = [
    [business?.number, business?.street].filter(Boolean).join(' '),
    business?.city,
  ].filter(Boolean).join(', ')

  const answered = contactStatus === 'answered'

  return (
    <Dialog open={!!business} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{business?.name ?? ''}</DialogTitle>
          {business?.category && (
            <p className="text-sm text-muted-foreground capitalize">
              {business.category.replace(/_/g, ' ')}
            </p>
          )}
        </DialogHeader>
        <DialogBody>
          {view === 'detail' && (
            <div className="space-y-4">
              {/* Info */}
              <div className="space-y-2 text-sm">
                {address && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{address}</span>
                  </div>
                )}
                {business?.phone && (
                  <div className="flex items-center gap-2">
                    <PhoneIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <a href={`tel:${business.phone}`} className="hover:underline">{business.phone}</a>
                  </div>
                )}
                {business?.website && (
                  <div className="flex items-center gap-2">
                    <GlobeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <a href={business.website} target="_blank" rel="noopener noreferrer"
                      className="truncate hover:underline text-primary">
                      {business.website.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                {statusError && <p className="mb-2 text-sm text-destructive">{statusError}</p>}
                <StatusChips statuses={statuses} value={business?.statusId ?? null} onSelect={handleStatusSelect} disabled={statusUpdating} />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</p>
                {tagError && <p className="mb-2 text-sm text-destructive">{tagError}</p>}
                <TagEditor tags={tags} onAttach={attachTag} onRemove={removeTag} />
              </div>

              <Button className="w-full" onClick={() => setView('log-visit')}>
                Log Visit
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setView('book-appointment')}>
                Book Appointment
              </Button>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
                {noteError && <p className="mb-2 text-sm text-destructive">{noteError}</p>}
                <NotesSection notes={bizNotes} currentUser={currentUser} onAdd={addNote} onDelete={removeNote} busy={noteBusy} />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Photos</p>
                <PhotoSection entity="business" entityId={business?.id ?? null} currentUser={currentUser} />
              </div>

              {/* Recent visits */}
              {visits.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Visits</p>
                  {visits.slice(0, 5).map(v => (
                    <div key={v.id} className="rounded-xl border px-3 py-2 text-sm space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{CONTACT_LABEL[v.contactStatus] ?? v.contactStatus}</span>
                        {v.saleOutcome && (
                          <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', OUTCOME_STYLES[v.saleOutcome])}>
                            {v.saleOutcome.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      {v.notes && <p className="text-muted-foreground">{v.notes}</p>}
                      <p className="text-xs text-muted-foreground">
                        {new Date(v.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'book-appointment' && (
            <div className="space-y-3">
              {bookError && <p className="text-sm text-destructive">{bookError}</p>}
              <AppointmentForm onSubmit={handleBookAppointment} onCancel={() => setView('detail')} />
            </div>
          )}

          {view === 'log-visit' && (
            <form onSubmit={handleSaveVisit} className="space-y-5">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</Label>
                <OptionGroup
                  options={[
                    { value: 'answered', label: 'Spoke to Someone' },
                    { value: 'not_home', label: 'Closed' },
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
                </>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes…" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Follow-up Date</Label>
                <Input type="datetime-local" value={followUpAt} onChange={e => setFollowUpAt(e.target.value)} />
              </div>

              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? 'Saving…' : 'Save Visit'}
                </Button>
                <Button type="button" variant="outline" onClick={() => { resetForm(); setView('detail') }}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
