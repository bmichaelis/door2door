#!/usr/bin/env node
// Export door2door businesses → CSV(s) for the kinda-crm contacts importer.
//
// Usage:
//   node --env-file=.env.local scripts/export-to-kinda-crm.mjs [flags]
//
// Flags:
//   --out=exports            output directory (default: exports)
//   --city=Orem,Provo        keep only these cities (case-insensitive, exact)
//   --category=restaurant    keep categories matching any term (substring match)
//   --limit=N                cap the number of businesses exported
//   --counts                 print the top cities & categories with counts, then exit
//                            (run this first to discover what to filter on)
//
// Reads every row from the `businesses` table (Overture/OSM POI data) and writes
// one or more CSV files whose headers match kinda-crm's importer
// (src/lib/contacts/csv.ts: "Business Name","Contact Person","Phone","Email",
// "Status","Industry","Website","Address","Notes","Tags","Ad Size","Ad Amount").
//
// Notes on the data:
//   • Overture is *place* data — it has business name, address, phone, website,
//     and a category, but NO contact-person name and NO email. Those two columns
//     are emitted empty on purpose. IMPORTANT: enrich BEFORE the first import.
//     kinda-crm's importer SKIPS duplicates (matched on company/email/phone) — it
//     does not update existing rows — so importing cold now and re-importing an
//     enriched copy later would just be skipped as duplicates. Enrich this CSV
//     first, then upload once (or update already-imported contacts in the app).
//   • Every row is exported as Status=cold (no visit outcomes exist yet).
//   • kinda-crm rejects imports over 2000 rows, so output is split into
//     ≤2000-row files automatically.

import { neon } from '@neondatabase/serverless'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_ROWS_PER_FILE = 2000
const SOURCE_TAG = 'door2door'

const flags = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)(?:=(.*))?$/)
  if (m) flags[m[1]] = m[2] ?? true
}
const outDir = typeof flags.out === 'string' ? flags.out : 'exports'
const cities = typeof flags.city === 'string' ? flags.city.split(',').map((s) => s.trim()).filter(Boolean) : []
const categories = typeof flags.category === 'string' ? flags.category.split(',').map((s) => s.trim()).filter(Boolean) : []
const limit = typeof flags.limit === 'string' && Number.isFinite(Number(flags.limit)) ? Number(flags.limit) : null

const HEADERS = [
  'Business Name', 'Contact Person', 'Phone', 'Email', 'Status', 'Industry',
  'Website', 'Address', 'Notes', 'Tags', 'Ad Size', 'Ad Amount',
]

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set. Run with:  node --env-file=.env.local scripts/export-to-kinda-crm.mjs')
  process.exit(1)
}

/** Quote a CSV cell only when it contains a comma, quote, or newline. */
function csvCell(value) {
  const s = value == null ? '' : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Build "123 Main St, Orem, UT 84058" from the address parts, skipping blanks. */
function buildAddress({ number, street, city, region, postcode }) {
  const line1 = [number, street].filter(Boolean).join(' ')
  const stateZip = [region, postcode].filter(Boolean).join(' ')
  const cityLine = [city, stateZip].filter(Boolean).join(', ')
  return [line1, cityLine].filter(Boolean).join(', ')
}

/** Map one businesses row to the kinda-crm CSV column order. */
function toRow(b) {
  const tags = [SOURCE_TAG, b.city].filter(Boolean).join(';')
  return [
    b.name ?? '',              // Business Name (required by importer)
    '',                        // Contact Person — enrich later
    b.phone ?? '',             // Phone
    '',                        // Email — enrich later
    'cold',                    // Status
    b.category ?? '',          // Industry (importer lowercases; blank → "other")
    b.website ?? '',           // Website
    buildAddress(b),           // Address
    '',                        // Notes
    tags,                      // Tags  e.g. "door2door;Orem"
    '',                        // Ad Size (blank → "single")
    '',                        // Ad Amount (blank → default $500)
  ]
}

const sql = neon(process.env.DATABASE_URL)

if (flags.counts) {
  const [cityRows, catRows] = await Promise.all([
    sql`SELECT COALESCE(city, '(none)') AS k, count(*)::int AS n FROM businesses WHERE name IS NOT NULL GROUP BY city ORDER BY n DESC LIMIT 40`,
    sql`SELECT COALESCE(category, '(none)') AS k, count(*)::int AS n FROM businesses WHERE name IS NOT NULL GROUP BY category ORDER BY n DESC LIMIT 40`,
  ])
  const fmt = (rows) => rows.map((r) => `  ${String(r.n).padStart(6)}  ${r.k}`).join('\n')
  console.log(`Top cities:\n${fmt(cityRows)}\n\nTop categories:\n${fmt(catRows)}`)
  console.log('\nFilter with e.g.:  --city=Orem,Provo  --category=restaurant,salon')
  process.exit(0)
}

// Build the filtered query. Uses sql.query(text, params) for dynamic WHERE:
// city is an exact case-insensitive match; category is a substring match so
// --category=restaurant also catches "fast_food_restaurant".
const conditions = ["name IS NOT NULL", "btrim(name) <> ''"]
const params = []
if (cities.length > 0) {
  params.push(cities.map((c) => c.toLowerCase()))
  conditions.push(`lower(city) = ANY($${params.length}::text[])`)
}
if (categories.length > 0) {
  const ors = categories.map((term) => {
    params.push(`%${term.toLowerCase()}%`)
    return `lower(category) LIKE $${params.length}`
  })
  conditions.push(`(${ors.join(' OR ')})`)
}
const queryText =
  `SELECT name, category, number, street, city, region, postcode, phone, website ` +
  `FROM businesses WHERE ${conditions.join(' AND ')} ` +
  `ORDER BY city NULLS LAST, name` +
  (limit != null ? ` LIMIT ${limit}` : '')
const businesses = await sql.query(queryText, params)

if (businesses.length === 0) {
  console.log('No businesses found — nothing to export.')
  process.exit(0)
}

mkdirSync(outDir, { recursive: true })

const fileCount = Math.ceil(businesses.length / MAX_ROWS_PER_FILE)
const written = []
for (let i = 0; i < businesses.length; i += MAX_ROWS_PER_FILE) {
  const chunk = businesses.slice(i, i + MAX_ROWS_PER_FILE)
  const part = fileCount === 1 ? '' : `-part-${String(i / MAX_ROWS_PER_FILE + 1).padStart(2, '0')}`
  const file = join(outDir, `kinda-crm-contacts${part}.csv`)
  const lines = [HEADERS, ...chunk.map(toRow)].map((cells) => cells.map(csvCell).join(','))
  writeFileSync(file, lines.join('\r\n') + '\r\n')
  written.push({ file, rows: chunk.length })
}

const withPhone = businesses.filter((b) => b.phone).length
const withWebsite = businesses.filter((b) => b.website).length
console.log(`Exported ${businesses.length} businesses → ${written.length} file(s) in ${outDir}/`)
for (const w of written) console.log(`  ${w.file}  (${w.rows} rows)`)
console.log(`\nField coverage:  phone ${withPhone}/${businesses.length}   website ${withWebsite}/${businesses.length}`)
console.log('Contact Person + Email are intentionally blank (Overture has no person/email data) — enrich, then re-upload.')
console.log(`\nImport at:  kinda-crm  →  /contacts/upload   (rows tagged "${SOURCE_TAG}")`)
