# Map Style Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bottom-left pill toggle to the field map letting reps switch between Map, Satellite, and Hybrid styles.

**Architecture:** A new `MapStyleToggle` component owns the style labels and Mapbox URL mapping. `MapView` holds the selected style in local state and passes it down to both the toggle and the `<Map>` component. No external state, no persistence.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS, react-map-gl v8, Vitest + @testing-library/react

---

## File Map

**New files:**
- `components/map/MapStyleToggle.tsx` — pill toggle UI, exports `MapStyle` type and `MAP_STYLE_URLS`
- `components/map/MapStyleToggle.test.tsx` — component unit tests

**Modified files:**
- `components/map/MapView.tsx` — add `mapStyle` state, render `<MapStyleToggle>`

---

## Task 1: Configure Vitest for React Component Tests

There is no `vitest.config.ts` in the project. Vitest defaults to the `node` environment, which doesn't support DOM APIs needed to render React components in tests. This task adds the config.

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 2: Verify existing tests still pass**

```bash
npm run test:run
```

Expected: all existing tests pass (permissions, auth, schema).

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: add vitest config with jsdom environment for React component tests"
```

---

## Task 2: Create MapStyleToggle Component (TDD)

**Files:**
- Create: `components/map/MapStyleToggle.test.tsx`
- Create: `components/map/MapStyleToggle.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/map/MapStyleToggle.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import MapStyleToggle, { MapStyle, MAP_STYLE_URLS } from './MapStyleToggle'

describe('MapStyleToggle', () => {
  it('renders three buttons with correct labels', () => {
    render(<MapStyleToggle value="streets" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Satellite' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hybrid' })).toBeInTheDocument()
  })

  it('marks the active style button as active', () => {
    render(<MapStyleToggle value="satellite" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Satellite' })).toHaveClass('bg-blue-600')
    expect(screen.getByRole('button', { name: 'Map' })).not.toHaveClass('bg-blue-600')
    expect(screen.getByRole('button', { name: 'Hybrid' })).not.toHaveClass('bg-blue-600')
  })

  it('calls onChange with the correct style key when a button is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MapStyleToggle value="streets" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Hybrid' }))
    expect(onChange).toHaveBeenCalledWith('hybrid')
  })

  it('MAP_STYLE_URLS contains valid mapbox style URLs for all three styles', () => {
    const styles: MapStyle[] = ['streets', 'satellite', 'hybrid']
    for (const style of styles) {
      expect(MAP_STYLE_URLS[style]).toMatch(/^mapbox:\/\/styles\/mapbox\//)
    }
  })
})
```

- [ ] **Step 2: Install @testing-library/user-event if missing**

```bash
npm ls @testing-library/user-event
```

If not listed, install it:

```bash
npm install --save-dev @testing-library/user-event
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm run test:run -- components/map/MapStyleToggle.test.tsx
```

Expected: FAIL — `Cannot find module './MapStyleToggle'`

- [ ] **Step 4: Create `components/map/MapStyleToggle.tsx`**

```tsx
'use client'

export type MapStyle = 'streets' | 'satellite' | 'hybrid'

export const MAP_STYLE_URLS: Record<MapStyle, string> = {
  streets:   'mapbox://styles/mapbox/streets-v12',
  satellite: 'mapbox://styles/mapbox/satellite-v9',
  hybrid:    'mapbox://styles/mapbox/satellite-streets-v12',
}

const LABELS: { style: MapStyle; label: string }[] = [
  { style: 'streets',   label: 'Map' },
  { style: 'satellite', label: 'Satellite' },
  { style: 'hybrid',    label: 'Hybrid' },
]

type Props = {
  value: MapStyle
  onChange: (style: MapStyle) => void
}

export default function MapStyleToggle({ value, onChange }: Props) {
  return (
    <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 1 }}>
      <div className="flex rounded-full bg-white shadow-md text-xs font-semibold p-1 gap-0.5">
        {LABELS.map(({ style, label }) => (
          <button
            key={style}
            onClick={() => onChange(style)}
            className={
              style === value
                ? 'bg-blue-600 text-white rounded-full px-3 py-1'
                : 'text-gray-600 px-3 py-1 rounded-full hover:bg-gray-100'
            }
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm run test:run -- components/map/MapStyleToggle.test.tsx
```

Expected: all 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add components/map/MapStyleToggle.tsx components/map/MapStyleToggle.test.tsx
git commit -m "feat: add MapStyleToggle component with Map/Satellite/Hybrid options"
```

---

## Task 3: Wire MapStyleToggle into MapView

**Files:**
- Modify: `components/map/MapView.tsx`

- [ ] **Step 1: Update `components/map/MapView.tsx`**

Replace the entire file with:

```tsx
'use client'
import Map, { NavigationControl } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAPBOX_TOKEN } from '@/lib/mapbox'
import { NeighborhoodLayer } from './NeighborhoodLayer'
import { HousePins } from './HousePins'
import { useState, useEffect } from 'react'
import type { House, Neighborhood } from '@/lib/db/schema'
import MapStyleToggle, { MapStyle, MAP_STYLE_URLS } from './MapStyleToggle'

type Props = {
  neighborhoods: (Neighborhood & { boundary: GeoJSON.Polygon })[]
  houses: House[]
  onHouseClick: (house: House) => void
  onMapClick?: (lat: number, lng: number) => void
}

export default function MapView({ neighborhoods, houses, onHouseClick, onMapClick }: Props) {
  const [viewport, setViewport] = useState({
    longitude: -98.5795,
    latitude: 39.8283,
    zoom: 10,
  })
  const [mapStyle, setMapStyle] = useState<MapStyle>('streets')

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      pos => setViewport(v => ({ ...v, longitude: pos.coords.longitude, latitude: pos.coords.latitude, zoom: 13 })),
      () => {} // silently keep the default if denied
    )
  }, [])

  return (
    <Map
      {...viewport}
      onMove={e => setViewport(e.viewState)}
      mapboxAccessToken={MAPBOX_TOKEN}
      mapStyle={MAP_STYLE_URLS[mapStyle]}
      style={{ width: '100%', height: '100%' }}
      interactiveLayerIds={['house-circles']}
      onClick={e => {
        const feature = e.features?.[0]
        if (feature?.layer?.id === 'house-circles') {
          const house = houses.find(h => h.id === feature.properties?.id)
          if (house) { onHouseClick(house); return }
        }
        onMapClick?.(e.lngLat.lat, e.lngLat.lng)
      }}
    >
      <NavigationControl position="top-right" />
      <NeighborhoodLayer neighborhoods={neighborhoods} />
      <HousePins houses={houses} onHouseClick={onHouseClick} />
      <MapStyleToggle value={mapStyle} onChange={setMapStyle} />
    </Map>
  )
}
```

- [ ] **Step 2: Run all tests to verify nothing regressed**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add components/map/MapView.tsx
git commit -m "feat: wire map style toggle into MapView"
```
