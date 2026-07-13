import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export interface JournalEntry {
  idx: number
  when: number
  tag: string
}

export interface WhenOrderViolation {
  idx: number
  tag: string
  when: number
  prevTag: string
  prevWhen: number
}

/**
 * Journal entries authored before the strictly-increasing-`when` convention
 * (#14). Their `when` values are backdated and cannot be corrected without
 * backfilling the prod `drizzle.__drizzle_migrations` ledger, which is out of
 * scope for #14. Both are IF NOT EXISTS-safe and already present in prod.
 * See lib/db/migrations/README.md. Do NOT add new indices here — fix the
 * `when` instead.
 */
export const GRANDFATHERED_IDX: ReadonlySet<number> = new Set([2, 7])

const JOURNAL_PATH = fileURLToPath(
  new URL('./migrations/meta/_journal.json', import.meta.url),
)

/** Reads and parses the drizzle migration journal, entries sorted by idx. */
export function readJournal(): JournalEntry[] {
  const raw = readFileSync(JOURNAL_PATH, 'utf8')
  const parsed = JSON.parse(raw) as { entries: JournalEntry[] }
  return [...parsed.entries].sort((a, b) => a.idx - b.idx)
}

/**
 * Returns every entry whose `when` is NOT strictly greater than the previous
 * entry's `when`, skipping any entry whose idx is in `grandfathered`. An empty
 * array means the journal is healthy.
 */
export function findWhenOrderViolations(
  entries: JournalEntry[],
  grandfathered: ReadonlySet<number> = new Set(),
): WhenOrderViolation[] {
  const violations: WhenOrderViolation[] = []
  for (let i = 1; i < entries.length; i++) {
    const entry = entries[i]
    const prev = entries[i - 1]
    if (grandfathered.has(entry.idx)) continue
    if (entry.when <= prev.when) {
      violations.push({
        idx: entry.idx,
        tag: entry.tag,
        when: entry.when,
        prevTag: prev.tag,
        prevWhen: prev.when,
      })
    }
  }
  return violations
}
