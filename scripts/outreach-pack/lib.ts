export const UTAH_BBOX = { w: -112.10, s: 39.77, e: -111.30, n: 40.45 } as const

function escapeField(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.join(',')]
  for (const row of rows) lines.push(columns.map((c) => escapeField(row[c])).join(','))
  return lines.join('\n') + '\n'
}

export function ownerType(firstName: string | null): 'person' | 'entity' {
  return firstName ? 'person' : 'entity'
}
