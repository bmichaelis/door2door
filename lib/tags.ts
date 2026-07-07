// Client-safe tag helpers — this module must never import server-only code (db, auth)

/** Trim and collapse internal whitespace. Casing is preserved; case-insensitive
 * uniqueness is enforced by the DB index on lower(name). */
export function normalizeTagName(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}
