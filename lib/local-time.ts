// Pure wall-clock helpers for zone-less local timestamps ('YYYY-MM-DDTHH:MM[:SS]').
// Uses Date.UTC purely as a calendar calculator — the runtime timezone never leaks in.

export function normalizeLocal(dt: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dt) ? `${dt}:00` : dt
}

export function addMinutesLocal(dt: string, minutes: number): string {
  const [datePart, timePart] = normalizeLocal(dt).split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const [hh, mm, ss] = timePart.split(':').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d, hh, mm + minutes, ss))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`
}
