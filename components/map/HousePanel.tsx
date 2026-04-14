'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { VisitForm, type VisitFormData } from '@/components/forms/VisitForm'
import { HouseholdForm } from '@/components/forms/HouseholdForm'
import type { HouseRow } from '@/lib/db/schema'
import { formatAddress } from '@/lib/houses'
import { ChevronLeftIcon } from 'lucide-react'

type Household = { id: string; surname: string | null; headOfHouseholdName: string | null; active: boolean; createdAt: string }
type Visit = { id: string; contactStatus: string; interestLevel: string | null; saleOutcome: string | null; notes: string | null; createdAt: string }
type Product = { id: string; name: string }

type Props = {
  house: HouseRow | null
  userRole: string
  onClose: () => void
  onHouseUpdate?: (id: string, updates: Partial<HouseRow & { lastOutcome?: string | null }>) => void
}

type View = 'detail' | 'log-visit' | 'new-household'

const OUTCOME_STYLES: Record<string, string> = {
  sold: 'bg-green-100 text-green-800',
  follow_up: 'bg-blue-100 text-blue-800',
  not_sold: 'bg-red-100 text-red-800',
}

const CONTACT_LABEL: Record<string, string> = {
  answered: 'Answered',
  not_home: 'Not Home',
  refused: 'Refused',
}

export function HousePanel({ house, userRole, onClose, onHouseUpdate }: Props) {
  const [view, setView] = useState<View>('detail')
  const [households, setHouseholds] = useState<Household[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visitHouseholdId, setVisitHouseholdId] = useState<string | null>(null)

  const activeHousehold = households.find(h => h.active)

  const fetchData = useCallback(async () => {
    if (!house) return
    setLoading(true)
    setError(null)
    try {
      const [hRes, pRes] = await Promise.all([
        fetch(`/api/households?houseId=${house.id}`),
        fetch('/api/products'),
      ])
      if (!hRes.ok) throw new Error('Failed to load household data')
      if (!pRes.ok) throw new Error('Failed to load products')
      const hh: Household[] = await hRes.json()
      setHouseholds(hh)
      setProducts(await pRes.json())
      const active = hh.find(h => h.active)
      if (active) {
        const vRes = await fetch(`/api/visits?householdId=${active.id}`)
        if (!vRes.ok) throw new Error('Failed to load visit history')
        setVisits(await vRes.json())
      } else {
        setVisits([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [house])

  useEffect(() => {
    if (!house) return
    setView('detail')
    setVisitHouseholdId(null)
    fetchData()
  }, [house?.id, fetchData])

  async function handleLogVisitClick() {
    if (!house) return
    if ((house.doNotKnock || house.noSolicitingSign) &&
      !window.confirm('This house is flagged. Are you sure you want to log a visit?')) return
    if (activeHousehold) {
      setVisitHouseholdId(activeHousehold.id)
      setView('log-visit')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/households', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ houseId: house.id }),
      })
      if (!res.ok) throw new Error('Failed to start visit')
      const newHousehold: Household = await res.json()
      setHouseholds(prev => [...prev, newHousehold])
      setVisitHouseholdId(newHousehold.id)
      setView('log-visit')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start visit')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogVisit(data: VisitFormData) {
    const res = await fetch('/api/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) { setError('Failed to save visit. Please try again.'); return }
    if (house) onHouseUpdate?.(house.id, { lastOutcome: data.saleOutcome ?? null })
    setView('detail')
    setVisitHouseholdId(null)
    fetchData()
  }

  async function handleNewHousehold(data: { houseId: string; surname: string; headOfHouseholdName: string }) {
    const res = await fetch('/api/households', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) { setError('Failed to save household. Please try again.'); return }
    setView('detail')
    fetchData()
  }

  async function handleFlagToggle(field: 'noSolicitingSign' | 'doNotKnock') {
    if (!house) return
    if (!window.confirm('Are you sure you want to toggle this flag? This will warn all reps.')) return
    const res = await fetch(`/api/houses/${house.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: !house[field] }),
    })
    if (!res.ok) { setError('Failed to update flag. Please try again.'); return }
    onHouseUpdate?.(house.id, { [field]: !house[field] })
    fetchData()
  }

  const isFlagged = house ? (house.doNotKnock || house.noSolicitingSign) : false

  const viewTitle =
    view === 'log-visit' ? 'Log Visit' :
    view === 'new-household' ? 'New Family Moved In' :
    null

  return (
    <Dialog open={!!house} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          {view !== 'detail' && (
            <button
              onClick={() => { setView('detail'); setVisitHouseholdId(null) }}
              className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeftIcon className="size-3" />
              Back
            </button>
          )}
          <DialogTitle>
            {view === 'detail' ? (house ? formatAddress(house) : '') : viewTitle}
          </DialogTitle>
          {view === 'detail' && house && (
            <p className="text-sm text-muted-foreground">{house.street}, {house.city}</p>
          )}
          {isFlagged && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {house?.doNotKnock && <Badge variant="destructive">Do Not Knock</Badge>}
              {house?.noSolicitingSign && <Badge variant="destructive">No Soliciting</Badge>}
            </div>
          )}
        </DialogHeader>

        <DialogBody>
          {error && (
            <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {view === 'detail' && (
            <div className="space-y-5">
              {/* Household */}
              <div className="rounded-xl bg-muted/50 px-4 py-3">
                {activeHousehold ? (
                  <>
                    <p className="font-medium">{activeHousehold.surname ?? 'Unknown family'}</p>
                    {activeHousehold.headOfHouseholdName && (
                      <p className="text-sm text-muted-foreground">{activeHousehold.headOfHouseholdName}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No household on record</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleLogVisitClick} disabled={loading}>
                  Log Visit
                </Button>
                <Button variant="outline" onClick={() => setView('new-household')}>
                  New Family Moved In
                </Button>
                {userRole === 'rep' && (
                  <Button size="sm" variant="outline" onClick={() => handleFlagToggle('noSolicitingSign')}>
                    {house?.noSolicitingSign ? 'Clear No Soliciting' : 'No Soliciting Sign'}
                  </Button>
                )}
                {(userRole === 'admin' || userRole === 'manager') && (
                  <Button size="sm" variant="outline" onClick={() => handleFlagToggle('doNotKnock')}>
                    {house?.doNotKnock ? 'Clear Do Not Knock' : 'Mark Do Not Knock'}
                  </Button>
                )}
              </div>

              {/* Visit history */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visit History</p>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : visits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No visits yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {visits.map(v => (
                      <li key={v.id} className="flex items-start gap-3 rounded-xl border bg-background px-4 py-3 text-sm">
                        <div className="flex-1 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{CONTACT_LABEL[v.contactStatus] ?? v.contactStatus}</span>
                            {v.saleOutcome && (
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLES[v.saleOutcome] ?? ''}`}>
                                {v.saleOutcome.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                          {v.notes && <p className="text-muted-foreground">{v.notes}</p>}
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {new Date(v.createdAt).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {households.filter(h => !h.active).length > 0 && (
                  <div className="mt-4">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Previous Households</p>
                    {households.filter(h => !h.active).map(h => (
                      <p key={h.id} className="text-sm text-muted-foreground">
                        {h.surname ?? 'Unknown'} — since {new Date(h.createdAt).toLocaleDateString()}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {view === 'log-visit' && visitHouseholdId && (
            <VisitForm
              householdId={visitHouseholdId}
              products={products}
              onSubmit={handleLogVisit}
              onCancel={() => { setView('detail'); setVisitHouseholdId(null) }}
            />
          )}

          {view === 'new-household' && house && (
            <HouseholdForm
              houseId={house.id}
              onSubmit={handleNewHousehold}
              onCancel={() => setView('detail')}
            />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
