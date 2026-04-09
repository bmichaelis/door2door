# Admin Import UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `/admin/import` page that lets admins upload a `.geojson` or `.csv` file to bulk-import houses, with automatic endpoint routing based on file extension.

**Architecture:** Two files — a server component page (admin guard + renders client) and a client component (all state/upload logic). The client detects the file extension and POSTs to the appropriate existing import route. Nav link added to the app layout for admins only.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS, Vitest + @testing-library/react

---

## File Map

**New files:**
- `app/(app)/admin/import/page.tsx` — server component, redirects non-admins
- `app/(app)/admin/import/client.tsx` — file picker, upload logic, result display
- `app/(app)/admin/import/client.test.tsx` — component unit tests

**Modified files:**
- `app/(app)/layout.tsx` — add "Import" nav link for admins

---

## Task 1: ImportClient Component (TDD)

**Files:**
- Create: `app/(app)/admin/import/client.test.tsx`
- Create: `app/(app)/admin/import/client.tsx`

### Existing imports + API to know before writing code

The project uses these shadcn/base-ui components:

```tsx
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'   // renders native <input>, accepts all HTML input props
import { Label } from '@/components/ui/label'   // renders native <label>, accepts all HTML label props
```

Import routes:
- `POST /api/houses/import/geojson` — GeoJSON file, returns `{ imported: number, skipped: number, total: number }`
- `POST /api/houses/import` — CSV file, returns `{ imported: number, total: number }` (no `skipped` field)

Both routes accept `multipart/form-data` with a `file` field.

---

- [ ] **Step 1: Write the failing tests**

Create `app/(app)/admin/import/client.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ImportClient } from './client'

afterEach(() => vi.restoreAllMocks())

describe('ImportClient', () => {
  it('renders a file input and a disabled upload button', () => {
    render(<ImportClient />)
    expect(screen.getByLabelText(/file/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled()
  })

  it('enables the upload button when a file is selected', async () => {
    const user = userEvent.setup()
    render(<ImportClient />)
    const file = new File(['{}'], 'addresses.geojson', { type: 'application/geo+json' })
    await user.upload(screen.getByLabelText(/file/i), file)
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled()
  })

  it('shows unsupported file type error for .txt files', async () => {
    const user = userEvent.setup()
    render(<ImportClient />)
    const file = new File(['test'], 'addresses.txt', { type: 'text/plain' })
    await user.upload(screen.getByLabelText(/file/i), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    expect(await screen.findByText(/unsupported file type/i)).toBeInTheDocument()
  })

  it('POSTs to the GeoJSON endpoint for .geojson files', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imported: 100, skipped: 2, total: 102 }),
    }))
    render(<ImportClient />)
    const file = new File(['{}'], 'addresses.geojson', { type: 'application/geo+json' })
    await user.upload(screen.getByLabelText(/file/i), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/houses/import/geojson',
        expect.any(Object)
      )
    )
  })

  it('POSTs to the CSV endpoint for .csv files', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imported: 50, total: 50 }),
    }))
    render(<ImportClient />)
    const file = new File(['addr1\naddr2'], 'addresses.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText(/file/i), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/houses/import',
        expect.any(Object)
      )
    )
  })

  it('shows result card with Imported, Skipped, and Total after GeoJSON upload', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imported: 12450, skipped: 3, total: 12453 }),
    }))
    render(<ImportClient />)
    const file = new File(['{}'], 'data.geojson', { type: 'application/geo+json' })
    await user.upload(screen.getByLabelText(/file/i), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    expect(await screen.findByText('12,450')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('12,453')).toBeInTheDocument()
    expect(screen.getByText(/imported/i)).toBeInTheDocument()
    expect(screen.getByText(/skipped/i)).toBeInTheDocument()
    expect(screen.getByText(/total/i)).toBeInTheDocument()
  })

  it('omits the Skipped row when response has no skipped field (CSV)', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imported: 50, total: 55 }),
    }))
    render(<ImportClient />)
    const file = new File(['addr'], 'data.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText(/file/i), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    await screen.findByRole('button', { name: 'Upload another file' })
    expect(screen.queryByText(/skipped/i)).not.toBeInTheDocument()
  })

  it('shows network error when fetch throws', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')))
    render(<ImportClient />)
    const file = new File(['{}'], 'data.geojson', { type: 'application/geo+json' })
    await user.upload(screen.getByLabelText(/file/i), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    expect(await screen.findByText(/network error/i)).toBeInTheDocument()
  })

  it('resets to idle and re-enables file input after clicking "Upload another file"', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imported: 10, total: 10 }),
    }))
    render(<ImportClient />)
    const file = new File(['addr'], 'data.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText(/file/i), file)
    await user.click(screen.getByRole('button', { name: 'Upload' }))
    await user.click(await screen.findByRole('button', { name: 'Upload another file' }))
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- app/\(app\)/admin/import/client.test.tsx
```

Expected: FAIL — `Cannot find module './client'`

- [ ] **Step 3: Create `app/(app)/admin/import/client.tsx`**

```tsx
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
    setFileKey(k => k + 1) // remounts Input to clear the file selection
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
              accept=".geojson,.csv"
              onChange={handleFileChange}
              className="mt-1"
            />
          </div>

          {state.status === 'error' && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}

          <Button type="submit" disabled={state.status !== 'selected'}>
            {state.status === 'uploading' ? 'Uploading…' : 'Upload'}
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:run -- app/\(app\)/admin/import/client.test.tsx
```

Expected: all 8 tests PASS.

**If some tests fail due to `@base-ui/react/input` not rendering a native input in jsdom:** The `Input` component wraps `@base-ui/react/input`. If `getByLabelText(/file/i)` fails because the label association doesn't resolve, fall back to `getByRole('textbox')` or use `container.querySelector('input[type="file"]')`. Adjust the test helper only — do not change the component.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/admin/import/client.tsx app/\(app\)/admin/import/client.test.tsx
git commit -m "feat: add ImportClient component for house bulk import"
```

---

## Task 2: Import Page + Nav Link

**Files:**
- Create: `app/(app)/admin/import/page.tsx`
- Modify: `app/(app)/layout.tsx`

- [ ] **Step 1: Create `app/(app)/admin/import/page.tsx`**

```tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ImportClient } from './client'

export default async function ImportPage() {
  const session = await auth()
  if (session?.user?.role !== 'admin') redirect('/map')
  return <ImportClient />
}
```

- [ ] **Step 2: Add Import nav link to `app/(app)/layout.tsx`**

Current nav (lines 15–21):
```tsx
<nav className="flex gap-4 text-sm">
  <Link href="/map" className="font-medium">Map</Link>
  <Link href="/dashboard">Dashboard</Link>
  {(role === 'admin' || role === 'manager') && (
    <Link href="/admin/users">Admin</Link>
  )}
</nav>
```

Replace with:
```tsx
<nav className="flex gap-4 text-sm">
  <Link href="/map" className="font-medium">Map</Link>
  <Link href="/dashboard">Dashboard</Link>
  {(role === 'admin' || role === 'manager') && (
    <Link href="/admin/users">Admin</Link>
  )}
  {role === 'admin' && (
    <Link href="/admin/import">Import</Link>
  )}
</nav>
```

- [ ] **Step 3: Run the full test suite**

```bash
npm run test:run
```

Expected: all tests pass (no regressions).

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/admin/import/page.tsx app/\(app\)/layout.tsx
git commit -m "feat: add admin import page and nav link"
```
