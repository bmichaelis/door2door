import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { normalizeTagName } from './tags'

type TagHit = { id: string; name: string }

/** Find a tag case-insensitively or create it. Handles the unique-index race:
 * if a concurrent request creates the same tag between our SELECT and INSERT,
 * the INSERT fails and we re-select. Returns null for blank names. */
export async function getOrCreateTag(rawName: string): Promise<(TagHit & { created: boolean }) | null> {
  const name = normalizeTagName(rawName)
  if (!name) return null
  const existing = await db.execute(sql`SELECT id, name FROM tags WHERE lower(name) = lower(${name}) LIMIT 1`)
  if (existing.rows[0]) return { ...(existing.rows[0] as TagHit), created: false }
  try {
    const inserted = await db.execute(sql`INSERT INTO tags (name) VALUES (${name}) RETURNING id, name`)
    return { ...(inserted.rows[0] as TagHit), created: true }
  } catch {
    const raced = await db.execute(sql`SELECT id, name FROM tags WHERE lower(name) = lower(${name}) LIMIT 1`)
    return raced.rows[0] ? { ...(raced.rows[0] as TagHit), created: false } : null
  }
}
