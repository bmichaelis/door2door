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
    <div className="flex rounded-full bg-background/95 border shadow-lg backdrop-blur-sm text-sm font-medium overflow-hidden">
      {LABELS.map(({ style, label }) => (
        <button
          key={style}
          type="button"
          onClick={() => onChange(style)}
          className={
            style === value
              ? 'bg-primary text-primary-foreground px-4 py-2'
              : 'text-muted-foreground px-4 py-2 hover:text-foreground transition-colors'
          }
        >
          {label}
        </button>
      ))}
    </div>
  )
}
