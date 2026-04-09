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
    <div className="absolute bottom-[12px] left-[12px] z-[1]">
      <div className="flex rounded-full bg-white shadow-md text-xs font-semibold p-1 gap-0.5">
        {LABELS.map(({ style, label }) => (
          <button
            key={style}
            type="button"
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
