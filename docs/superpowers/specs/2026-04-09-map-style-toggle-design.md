# Map Style Toggle — Design Spec

**Date:** 2026-04-09

---

## Overview

Add a 3-way style toggle to the field map so reps can switch between street, satellite, and hybrid views while working in the field.

---

## UI

A pill-shaped toggle sits in the bottom-left corner of the map with three labeled segments: **Map**, **Satellite**, **Hybrid**. The active segment is highlighted (blue background, white text). Inactive segments are muted. The pill uses absolute positioning inside the Mapbox map container so it floats over the map canvas without affecting page layout.

---

## Components

### `components/map/MapStyleToggle.tsx` (new)

Props:
- `value: MapStyle` — currently active style key
- `onChange: (style: MapStyle) => void` — called when user taps a segment

Defines and exports the `MapStyle` type:

```ts
export type MapStyle = 'streets' | 'satellite' | 'hybrid'

export const MAP_STYLE_URLS: Record<MapStyle, string> = {
  streets:   'mapbox://styles/mapbox/streets-v12',
  satellite: 'mapbox://styles/mapbox/satellite-v9',
  hybrid:    'mapbox://styles/mapbox/satellite-streets-v12',
}
```

Renders a `<div>` with absolute positioning (`bottom: 12px; left: 12px; z-index: 1`) containing three `<button>` elements. No external dependencies — plain Tailwind classes only.

### `components/map/MapView.tsx` (modified)

- Add `mapStyle` state: `const [mapStyle, setMapStyle] = useState<MapStyle>('streets')`
- Pass `MAP_STYLE_URLS[mapStyle]` to the `<Map>` component's `mapStyle` prop
- Render `<MapStyleToggle value={mapStyle} onChange={setMapStyle} />` as a child of `<Map>`

---

## Styling

The pill is self-contained with Tailwind. Active segment: `bg-blue-600 text-white rounded-full`. Inactive: `text-gray-600`. Outer pill: `bg-white rounded-full shadow-md flex text-xs font-semibold`.

---

## Scope

- No database changes
- No API changes
- No changes to MapView's props interface
- No persistence of selected style between sessions (default always resets to Map)
