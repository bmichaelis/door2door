// Client-safe activity helpers — must never import server-only code

export type ActivityPoint = {
  userId: string
  repName: string | null
  lat: number
  lng: number
  at: string
}

export const ACTIVITY_COLORS = ['#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#6366f1']

/** Stable rep→color assignment: unique userIds sorted, mapped onto the palette (cycling). */
export function repPalette(points: ActivityPoint[]): Map<string, string> {
  const ids = [...new Set(points.map(p => p.userId))].sort()
  return new Map(ids.map((id, i) => [id, ACTIVITY_COLORS[i % ACTIVITY_COLORS.length]]))
}
