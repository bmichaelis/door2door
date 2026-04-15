#!/usr/bin/env node
// Imports residential owner surnames from Utah County Tax Parcels GDB.
// Run: node --env-file=.env.local scripts/import-tax-parcels.js
//
// Address construction from component fields:
//   "NUM [PRE] NAME [TYPE|ST]"  — appends ST when SITE_STREET_TYPE is empty (grid streets + some named)
//
// Name extraction:
//   "PATTERSON, MICHAEL A & LISBETH" → surname "Patterson", first "Michael"
//   "GREAT HEIGHTS VENTURES LLC"     → surname kept as-is (no comma), first null

const { spawn } = require('child_process')
const readline = require('readline')
const { Pool } = require('pg')

const BATCH_SIZE = 500
const GDB_PATH = 'data/TaxParcels.gdb'

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  const ogrProc = spawn('ogr2ogr', [
    '-f', 'CSV', '/vsistdout/',
    GDB_PATH, 'TaxParcel',
    '-select', 'OWNER_NAME,SITE_HOUSE_NUM,SITE_PRE_DIR,SITE_STREET_NAME,SITE_STREET_TYPE',
    '-where', "PROP_TYPE_DESCR = 'SINGLE FAMILY RES' AND SITE_HOUSE_NUM IS NOT NULL AND OWNER_NAME IS NOT NULL",
  ])

  const rl = readline.createInterface({ input: ogrProc.stdout, crlfDelay: Infinity })

  let headers = null
  let batch = []
  let totalCreated = 0
  let totalUpdated = 0
  let totalProcessed = 0

  for await (const line of rl) {
    if (!headers) {
      headers = parseCsvLine(line)
      continue
    }
    const vals = parseCsvLine(line)
    const row = Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? '').trim()]))

    const address = buildAddress(row)
    const { surname, firstName } = extractNames(row.OWNER_NAME)
    if (!address || !surname) continue

    batch.push({ ownerName: surname, firstName: firstName ?? null, address })

    if (batch.length >= BATCH_SIZE) {
      const r = await upsertBatch(pool, batch)
      totalCreated += r.created
      totalUpdated += r.updated
      totalProcessed += batch.length
      process.stdout.write(`\r  ${totalProcessed.toLocaleString()} parcels — ${totalUpdated} updated, ${totalCreated} created   `)
      batch = []
    }
  }

  if (batch.length > 0) {
    const r = await upsertBatch(pool, batch)
    totalCreated += r.created
    totalUpdated += r.updated
    totalProcessed += batch.length
  }

  await pool.end()
  console.log(`\nDone: ${totalUpdated} households updated, ${totalCreated} new households created (${totalProcessed.toLocaleString()} parcels processed)`)
}

function buildAddress(row) {
  const num  = row.SITE_HOUSE_NUM
  const pre  = row.SITE_PRE_DIR
  const name = row.SITE_STREET_NAME
  const type = row.SITE_STREET_TYPE
  if (!num || !name) return null
  const parts = [num]
  if (pre) parts.push(pre)
  parts.push(name)
  parts.push(type || 'ST')   // grid streets have no type — OpenAddresses always uses ST
  return parts.join(' ').toUpperCase()
}

function extractNames(raw) {
  if (!raw) return { surname: null, firstName: null }
  const commaIdx = raw.indexOf(',')
  if (commaIdx < 0) {
    // No comma — business/entity name, title-case the whole thing
    const surname = raw.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    return { surname, firstName: null }
  }
  // "PATTERSON, MICHAEL A & LISBETH"
  const surnameRaw = raw.slice(0, commaIdx)
  const surname = surnameRaw.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

  // Take the first token after the comma; stop before middle initials (single letter) and "&"
  const afterComma = raw.slice(commaIdx + 1).trim()
  const firstToken = afterComma.split(/\s+/)[0] ?? ''
  // Skip single-letter tokens (initials) — shouldn't happen as first token but guard anyway
  const firstName = firstToken.length > 1
    ? firstToken.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    : null
  return { surname, firstName }
}

async function upsertBatch(pool, items) {
  const { rows } = await pool.query(`
    WITH input AS (
      SELECT
        (item->>'ownerName')::text                  AS owner_name,
        (item->>'firstName')::text                  AS first_name,
        upper(trim((item->>'address')::text))       AS address
      FROM json_array_elements($1::json) AS item
    ),
    matched AS (
      SELECT DISTINCT ON (h.id)
        h.id           AS house_id,
        i.owner_name,
        i.first_name
      FROM input i
      JOIN houses h ON upper(trim(h.number || ' ' || h.street)) = i.address
      ORDER BY h.id, i.owner_name
    ),
    updated AS (
      UPDATE households hh
      SET surname = m.owner_name,
          head_of_household_name = m.first_name
      FROM matched m
      WHERE hh.house_id = m.house_id
        AND hh.active = true
      RETURNING hh.house_id
    ),
    inserted AS (
      INSERT INTO households (id, house_id, surname, head_of_household_name, active, created_at)
      SELECT gen_random_uuid(), m.house_id, m.owner_name, m.first_name, true, now()
      FROM matched m
      WHERE m.house_id NOT IN (SELECT house_id FROM updated)
        AND NOT EXISTS (
          SELECT 1 FROM households ex
          WHERE ex.house_id = m.house_id AND ex.active = true
        )
      RETURNING house_id
    )
    SELECT
      (SELECT count(*) FROM updated)::int  AS updated,
      (SELECT count(*) FROM inserted)::int AS created
  `, [JSON.stringify(items)])

  return { updated: rows[0]?.updated ?? 0, created: rows[0]?.created ?? 0 }
}

// Handles quoted fields and escaped quotes ("") per RFC 4180
function parseCsvLine(line) {
  const result = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (c === ',' && !inQuotes) {
      result.push(field); field = ''
    } else {
      field += c
    }
  }
  result.push(field)
  return result
}

main().catch(e => { console.error(e); process.exit(1) })
