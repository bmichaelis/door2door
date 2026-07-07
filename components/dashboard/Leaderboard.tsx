'use client'
import { useState } from 'react'
import type { LeaderboardRow } from '@/lib/stats'
import { cn } from '@/lib/utils'

export type LeaderboardWindow = 'week' | 'month'

const MEDALS = ['🥇', '🥈', '🥉']

function count(r: LeaderboardRow, key: 'doors' | 'conversations' | 'sales', period: LeaderboardWindow): number {
  const raw = r[`${key}_${period}` as keyof LeaderboardRow] as string
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

/** Rank by doors desc, tie-break sales desc, then name asc (null names last). */
export function rankRows(rows: LeaderboardRow[], period: LeaderboardWindow): (LeaderboardRow & { rank: number })[] {
  return [...rows]
    .sort((a, b) =>
      count(b, 'doors', period) - count(a, 'doors', period) ||
      count(b, 'sales', period) - count(a, 'sales', period) ||
      (a.name ?? '￿').localeCompare(b.name ?? '￿'))
    .map((r, i) => ({ ...r, rank: i + 1 }))
}

type Props = {
  rows: LeaderboardRow[]
  currentUserId: string
}

export function Leaderboard({ rows, currentUserId }: Props) {
  const [period, setPeriod] = useState<LeaderboardWindow>('week')

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No team members yet.</p>
  }

  const ranked = rankRows(rows, period)

  return (
    <div className="space-y-3">
      <div className="flex w-fit overflow-hidden rounded-full border text-sm font-medium">
        {([['week', 'This Week'], ['month', 'This Month']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            aria-pressed={period === key}
            className={cn(
              'px-4 py-1.5 transition-colors',
              period === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-2 font-semibold">#</th>
            <th className="py-2 pr-2 font-semibold">Rep</th>
            <th className="py-2 pr-2 text-right font-semibold">Doors</th>
            <th className="py-2 pr-2 text-right font-semibold">Conversations</th>
            <th className="py-2 text-right font-semibold">Sales</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map(r => (
            <tr key={r.id} className={cn('border-t', r.id === currentUserId && 'bg-muted font-medium')}>
              <td className="py-2 pr-2">{r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank}</td>
              <td className="py-2 pr-2">
                {r.name ?? 'Unknown'}
                {r.id === currentUserId && (
                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">you</span>
                )}
              </td>
              <td className="py-2 pr-2 text-right">{count(r, 'doors', period)}</td>
              <td className="py-2 pr-2 text-right">{count(r, 'conversations', period)}</td>
              <td className="py-2 text-right">{count(r, 'sales', period)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
