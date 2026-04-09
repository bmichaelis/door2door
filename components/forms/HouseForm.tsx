'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { reverseGeocode } from '@/lib/mapbox'

export type HouseFormData = {
  number: string
  street: string
  unit: string
  city: string
  region: string
  postcode: string
}

type Props = {
  lat: number
  lng: number
  onSubmit: (data: HouseFormData) => Promise<void>
  onCancel: () => void
}

export function HouseForm({ lat, lng, onSubmit, onCancel }: Props) {
  const [fields, setFields] = useState<HouseFormData>({
    number: '', street: '', unit: '', city: '', region: '', postcode: '',
  })
  const [loading, setLoading] = useState(false)
  const [geocoding, setGeocoding] = useState(true)

  useEffect(() => {
    reverseGeocode(lat, lng).then(result => {
      if (result) {
        setFields({
          number: result.number,
          street: result.street,
          unit: '',
          city: result.city,
          region: result.region,
          postcode: result.postcode,
        })
      }
      setGeocoding(false)
    })
  }, [lat, lng])

  function set(key: keyof HouseFormData) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setFields(f => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!fields.number.trim() || !fields.street.trim()) return
    setLoading(true)
    await onSubmit(fields)
    setLoading(false)
  }

  const isValid = fields.number.trim() && fields.street.trim() && fields.city.trim() && fields.postcode.trim()

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Pin dropped at {lat.toFixed(5)}, {lng.toFixed(5)}
      </p>
      {geocoding && <p className="text-sm text-muted-foreground">Looking up address…</p>}
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1">
          <Label>Number</Label>
          <Input value={fields.number} onChange={set('number')} placeholder="376" />
        </div>
        <div className="col-span-2">
          <Label>Street</Label>
          <Input value={fields.street} onChange={set('street')} placeholder="S 800 East St" />
        </div>
      </div>
      <div>
        <Label>Unit <span className="text-muted-foreground">(optional)</span></Label>
        <Input value={fields.unit} onChange={set('unit')} placeholder="Apt 2B" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1">
          <Label>City</Label>
          <Input value={fields.city} onChange={set('city')} placeholder="Payson" />
        </div>
        <div className="col-span-1">
          <Label>State</Label>
          <Input value={fields.region} onChange={set('region')} placeholder="UT" maxLength={2} />
        </div>
        <div className="col-span-1">
          <Label>Zip</Label>
          <Input value={fields.postcode} onChange={set('postcode')} placeholder="84651" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={loading || !isValid} className="flex-1">
          {loading ? 'Adding…' : 'Add House'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
