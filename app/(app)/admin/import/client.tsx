'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type ImportResult = {
  imported: number
  skipped?: number
  total: number
}

type State =
  | { status: 'idle' }
  | { status: 'selected'; file: File }
  | { status: 'uploading' }
  | { status: 'done'; result: ImportResult }
  | { status: 'error'; message: string }

function endpointForFile(file: File): string | null {
  if (file.name.endsWith('.geojson')) return '/api/houses/import/geojson'
  if (file.name.endsWith('.csv')) return '/api/houses/import'
  return null
}

export function ImportClient() {
  const [state, setState] = useState<State>({ status: 'idle' })
  const [fileKey, setFileKey] = useState(0)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setState(file ? { status: 'selected', file } : { status: 'idle' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (state.status !== 'selected') return

    const { file } = state
    const endpoint = endpointForFile(file)
    if (!endpoint) {
      setState({ status: 'error', message: 'Unsupported file type. Upload a .geojson or .csv file.' })
      return
    }

    setState({ status: 'uploading' })
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(endpoint, { method: 'POST', body: formData })

      if (!res.ok) {
        let message = 'Import failed. Please try again.'
        try {
          const body = await res.json()
          if (body?.error) message = body.error
        } catch { /* use default message */ }
        setState({ status: 'error', message })
        return
      }

      setState({ status: 'done', result: await res.json() })
    } catch {
      setState({ status: 'error', message: 'Network error. Check your connection and try again.' })
    }
  }

  function reset() {
    setState({ status: 'idle' })
    setFileKey(k => k + 1)
  }

  return (
    <div className="p-6 max-w-md">
      <h1 className="text-xl font-semibold mb-4">Import Houses</h1>

      {state.status !== 'done' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="file">
              File <span className="text-muted-foreground font-normal">(.geojson or .csv)</span>
            </Label>
            <Input
              key={fileKey}
              id="file"
              type="file"
              onChange={handleFileChange}
              className="mt-1"
            />
          </div>

          {state.status === 'error' && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}

          <Button type="submit" disabled={state.status !== 'selected'}>
            {state.status === 'uploading' ? 'Uploading\u2026' : 'Upload'}
          </Button>
        </form>
      )}

      {state.status === 'done' && (
        <div className="space-y-4">
          <div className="rounded border p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Imported</span>
              <span className="font-medium">{state.result.imported.toLocaleString()}</span>
            </div>
            {state.result.skipped != null && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Skipped</span>
                <span className="font-medium">{state.result.skipped.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium">{state.result.total.toLocaleString()}</span>
            </div>
          </div>
          <Button variant="outline" onClick={reset}>Upload another file</Button>
        </div>
      )}
    </div>
  )
}
