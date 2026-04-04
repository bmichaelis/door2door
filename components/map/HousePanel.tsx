'use client'
import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { VisitForm, type VisitFormData } from '@/components/forms/VisitForm'
import { HouseholdForm } from '@/components/forms/HouseholdForm'
import type { House } from '@/lib/db/schema'

type Household = { id: string; surname: string | null; headOfHouseholdName: string | null; active: boolean; createdAt: string }
type Visit = { id: string; contactStatus: string; interestLevel: string | null; saleOutcome: string | null; notes: string | null; createdAt: string }
type Product = { id: string; name: string }

type Props = {
  house: House | null
  userRole: string
  onClose: () => void
}

type View = 'detail' | 'log-visit' | 'new-household'

export function HousePanel({ house, userRole, onClose }: Props) {
  const [view, setView] = useState<View>('detail')
  const [households, setHouseholds] = useState<Household[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)

  const activeHousehold = households.find(h => h.active)

  useEffect(() => {
    if (!house) return
    setView('detail')
    fetchData()
  }, [house?.id])

  async function fetchData() {
    if (!house) return
    setLoading(true)
    const [hRes, pRes] = await Promise.all([
      fetch(`/api/households?houseId=${house.id}`),
      fetch('/api/products'),
    ])
    const hh: Household[] = await hRes.json()
    setHouseholds(hh)
    setProducts(await pRes.json())

    const active = hh.find(h => h.active)
    if (active) {
      const vRes = await fetch(`/api/visits?householdId=${active.id}`)
      setVisits(await vRes.json())
    }
    setLoading(false)
  }

  async function handleLogVisit(data: VisitFormData) {
    await fetch('/api/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setView('detail')
    fetchData()
  }

  async function handleNewHousehold(data: { houseId: string; surname: string; headOfHouseholdName: string }) {
    await fetch('/api/households', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setView('detail')
    fetchData()
  }

  async function handleFlagToggle(field: 'noSolicitingSign' | 'doNotKnock') {
    if (!house) return
    const confirmed = window.confirm('Are you sure you want to toggle this flag? This will warn all reps.')
    if (!confirmed) return
    await fetch(`/api/houses/${house.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: !house[field] }),
    })
    fetchData()
  }

  if (!house) return null

  const isFlagged = house.doNotKnock || house.noSolicitingSign

  return (
    <Sheet open={!!house} onOpenChange={open => !open && onClose()}>
      <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">
            {house.address}
            {isFlagged && <Badge variant="destructive" className="ml-2">Flagged</Badge>}
          </SheetTitle>
        </SheetHeader>

        {isFlagged && (
          <div className="my-3 rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {house.doNotKnock && <p>⚠️ Do Not Knock — this address is on a no-contact list.</p>}
            {house.noSolicitingSign && <p>⚠️ No Soliciting sign observed on property.</p>}
          </div>
        )}

        {view === 'detail' && (
          <div className="mt-4 space-y-4">
            {activeHousehold && (
              <div>
                <p className="text-sm font-medium">Current household: {activeHousehold.surname ?? 'Unknown'}</p>
                {activeHousehold.headOfHouseholdName && (
                  <p className="text-sm text-muted-foreground">{activeHousehold.headOfHouseholdName}</p>
                )}
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={() => {
                if (isFlagged) {
                  if (!window.confirm('This house is flagged. Are you sure you want to log a visit?')) return
                }
                setView('log-visit')
              }}>
                Log Visit
              </Button>
              <Button size="sm" variant="outline" onClick={() => setView('new-household')}>
                New Family Moved In
              </Button>
              {userRole === 'rep' && (
                <Button size="sm" variant="outline" onClick={() => handleFlagToggle('noSolicitingSign')}>
                  {house.noSolicitingSign ? 'Clear No Soliciting' : 'Mark No Soliciting Sign'}
                </Button>
              )}
              {(userRole === 'admin' || userRole === 'manager') && (
                <Button size="sm" variant="outline" onClick={() => handleFlagToggle('doNotKnock')}>
                  {house.doNotKnock ? 'Clear Do Not Knock' : 'Mark Do Not Knock'}
                </Button>
              )}
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Visit History</h3>
                {visits.length === 0 && <p className="text-sm text-muted-foreground">No visits yet.</p>}
                {visits.map(v => (
                  <div key={v.id} className="rounded border p-3 text-sm">
                    <div className="flex justify-between">
                      <Badge variant="outline">{v.contactStatus}</Badge>
                      <span className="text-muted-foreground">{new Date(v.createdAt).toLocaleDateString()}</span>
                    </div>
                    {v.saleOutcome && <p className="mt-1">Outcome: <strong>{v.saleOutcome}</strong></p>}
                    {v.notes && <p className="mt-1 text-muted-foreground">{v.notes}</p>}
                  </div>
                ))}

                {households.filter(h => !h.active).length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold text-muted-foreground">Previous Households</h3>
                    {households.filter(h => !h.active).map(h => (
                      <p key={h.id} className="text-sm text-muted-foreground">
                        {h.surname ?? 'Unknown'} — since {new Date(h.createdAt).toLocaleDateString()}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {view === 'log-visit' && activeHousehold && (
          <div className="mt-4">
            <VisitForm
              householdId={activeHousehold.id}
              products={products}
              onSubmit={handleLogVisit}
              onCancel={() => setView('detail')}
            />
          </div>
        )}

        {view === 'new-household' && (
          <div className="mt-4">
            <HouseholdForm
              houseId={house.id}
              onSubmit={handleNewHousehold}
              onCancel={() => setView('detail')}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
