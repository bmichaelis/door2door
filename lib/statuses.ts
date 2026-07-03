export type AutoKey = 'not_home' | 'interested' | 'callback' | 'customer' | 'not_interested'

// Client-safe status shape (API JSON serializes createdAt, so UI code uses
// this instead of the Drizzle Status type)
export type StatusOption = {
  id: string
  name: string
  color: string
  sortOrder: number
  active: boolean
  autoKey: AutoKey | null
}

/**
 * Map a logged visit onto the system status it should auto-set.
 * First match wins; returns null when nothing applies (visit logging
 * must never fail because of this).
 */
export function visitAutoKey(v: {
  contactStatus: string
  interestLevel?: string | null
  saleOutcome?: string | null
  followUpAt?: string | Date | null
}): AutoKey | null {
  if (v.saleOutcome === 'sold') return 'customer'
  if (v.saleOutcome === 'follow_up' || v.followUpAt) return 'callback'
  if (v.contactStatus === 'refused' || v.interestLevel === 'not_interested' || v.saleOutcome === 'not_sold') {
    return 'not_interested'
  }
  if (v.interestLevel === 'interested' || v.interestLevel === 'maybe') return 'interested'
  if (v.contactStatus === 'not_home') return 'not_home'
  return null
}

export const DEFAULT_PIN_COLOR = '#9ca3af'

export function pinColor(
  entity: { doNotKnock?: boolean; noSolicitingSign?: boolean; statusId?: string | null },
  colors: Record<string, string>,
  fallback: string = DEFAULT_PIN_COLOR,
): string {
  if (entity.doNotKnock || entity.noSolicitingSign) return '#000000'
  if (entity.statusId && colors[entity.statusId]) return colors[entity.statusId]
  return fallback
}

export function isValidHexColor(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s)
}
