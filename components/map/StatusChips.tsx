'use client'
import { cn } from '@/lib/utils'
import type { StatusOption } from '@/lib/statuses'

type Props = {
  statuses: StatusOption[]
  value: string | null
  onSelect: (statusId: string | null) => void
  disabled?: boolean
}

export function StatusChips({ statuses, value, onSelect, disabled }: Props) {
  const visible = statuses.filter(s => s.active || s.id === value)
  if (visible.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map(s => {
        const selected = s.id === value
        return (
          <button
            key={s.id}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onSelect(selected ? null : s.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-50',
              !selected && 'bg-background hover:bg-muted'
            )}
            style={selected
              ? { backgroundColor: s.color, borderColor: s.color, color: '#ffffff' }
              : { borderColor: s.color, color: s.color }}
          >
            {s.name}
          </button>
        )
      })}
    </div>
  )
}
