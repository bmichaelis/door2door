import { sql, type SQL } from 'drizzle-orm'

/** Split a query into `%token%` ILIKE patterns. Empty/whitespace input → []. */
export function tokenPatterns(q: string): string[] {
  return q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => '%' + t + '%')
}

/**
 * Build a parenthesized AND-chain of `expr ILIKE <pattern>` over every pattern.
 * Each ILIKE is a separate op so an expression trgm index can serve it
 * (BitmapAnd). Callers guarantee patterns.length >= 1 (routes reject empty q).
 */
export function ilikeAllTokens(expr: SQL, patterns: string[]): SQL {
  return sql`(${sql.join(
    patterns.map((p) => sql`${expr} ILIKE ${p}`),
    sql` AND `,
  )})`
}
