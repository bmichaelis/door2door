#!/usr/bin/env node
// Imports residential owner surnames from a county Tax Parcels GDB.
// Run: node --env-file=.env.local scripts/import-tax-parcels.js --county config/utah-county.json
//
// Address construction from component fields:
//   "NUM [PRE] NAME [TYPE|ST]"  — appends ST when street type field is empty (grid streets + some named)
//
// Name extraction:
//   "PATTERSON, MICHAEL A & LISBETH" → surname "Patterson", first "Michael", spouse "Lisbeth"
//   "GREAT HEIGHTS VENTURES LLC"     → surname kept as-is (no comma), first/spouse null

const { spawn } = require('child_process')
const readline = require('readline')
const { Pool } = require('pg')
const fs = require('fs')

const BATCH_SIZE = 500

function parseArgs() {
  const args = process.argv.slice(2)
  let countyConfig = null
  let gdbOverride = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--county' && args[i + 1]) countyConfig = JSON.parse(fs.readFileSync(args[++i], 'utf8'))
    if (args[i] === '--gdb' && args[i + 1]) gdbOverride = args[++i]
  }
  if (!countyConfig) { console.error('Usage: import-tax-parcels.js --county <config-file> [--gdb <path>]'); process.exit(1) }
  const tp = countyConfig.taxParcels
  return {
    gdbPath:        gdbOverride ?? tp.gdb,
    layer:          tp.layer          ?? 'TaxParcel',
    propTypeField:  tp.propTypeField  ?? 'PROP_TYPE_DESCR',
    propTypeValue:  tp.propTypeValue  ?? 'SINGLE FAMILY RES',
    ownerNameField: tp.ownerNameField ?? 'OWNER_NAME',
    houseNumField:  tp.houseNumField  ?? 'SITE_HOUSE_NUM',
    preDirField:    tp.preDirField    ?? 'SITE_PRE_DIR',
    streetNameField:tp.streetNameField?? 'SITE_STREET_NAME',
    streetTypeField:tp.streetTypeField?? 'SITE_STREET_TYPE',
  }
}

async function main() {
  const cfg = parseArgs()
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  const selectFields = [
    cfg.ownerNameField,
    cfg.houseNumField,
    cfg.preDirField,
    cfg.streetNameField,
    cfg.streetTypeField,
  ].join(',')

  const ogrProc = spawn('ogr2ogr', [
    '-f', 'CSV', '/vsistdout/',
    cfg.gdbPath, cfg.layer,
    '-select', selectFields,
    '-where', `${cfg.propTypeField} = '${cfg.propTypeValue}' AND ${cfg.houseNumField} IS NOT NULL AND ${cfg.ownerNameField} IS NOT NULL`,
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

    const address = buildAddress(row, cfg)
    const { surname, firstName, spouseName } = extractNames(row[cfg.ownerNameField])
    if (!address || !surname) continue

    batch.push({ ownerName: surname, firstName: firstName ?? null, spouseName: spouseName ?? null, address })

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

function buildAddress(row, cfg) {
  const num  = row[cfg.houseNumField]
  const pre  = row[cfg.preDirField]
  const name = row[cfg.streetNameField]
  const type = row[cfg.streetTypeField]
  if (!num || !name) return null
  const parts = [num]
  if (pre) parts.push(pre)
  parts.push(name)
  parts.push(type || 'ST')
  return parts.join(' ').toUpperCase()
}

function extractNames(raw) {
  if (!raw) return { surname: null, firstName: null, spouseName: null }
  const commaIdx = raw.indexOf(',')
  if (commaIdx < 0) {
    const surname = raw.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    return { surname, firstName: null, spouseName: null }
  }
  // "PATTERSON, MICHAEL A & LISBETH"  or  "MICHAELIS, BRETT AND NICOLE"
  const surnameRaw = raw.slice(0, commaIdx)
  const surname = surnameRaw.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

  const afterComma = raw.slice(commaIdx + 1).trim()

  // Split on " & " or " AND " to find spouse
  const spouseSep = afterComma.match(/\s+(?:&|AND)\s+(.+)$/i)
  const firstPart = spouseSep ? afterComma.slice(0, afterComma.length - spouseSep[0].length) : afterComma
  const spousePart = spouseSep ? spouseSep[1].trim() : null

  const firstToken = firstPart.split(/\s+/)[0] ?? ''
  const firstName = firstToken.length > 1
    ? firstToken.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    : null

  const spouseToken = spousePart ? (spousePart.split(/\s+/)[0] ?? '') : ''
  const spouseName = spouseToken.length > 1
    ? spouseToken.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    : null

  return { surname, firstName, spouseName }
}

async function upsertBatch(pool, items) {
  const { rows } = await pool.query(`
    WITH input AS (
      SELECT
        (item->>'ownerName')::text                  AS owner_name,
        (item->>'firstName')::text                  AS first_name,
        (item->>'spouseName')::text                 AS spouse_name,
        upper(trim((item->>'address')::text))       AS address
      FROM json_array_elements($1::json) AS item
    ),
    matched AS (
      SELECT DISTINCT ON (h.id)
        h.id           AS house_id,
        i.owner_name,
        i.first_name,
        i.spouse_name
      FROM input i
      JOIN houses h ON upper(trim(h.number || ' ' || h.street)) = i.address
      ORDER BY h.id, i.owner_name
    ),
    updated AS (
      UPDATE households hh
      SET surname = m.owner_name,
          head_of_household_name = m.first_name,
          spouse_name = m.spouse_name
      FROM matched m
      WHERE hh.house_id = m.house_id
        AND hh.active = true
      RETURNING hh.house_id
    ),
    inserted AS (
      INSERT INTO households (id, house_id, surname, head_of_household_name, spouse_name, active, created_at)
      SELECT gen_random_uuid(), m.house_id, m.owner_name, m.first_name, m.spouse_name, true, now()
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
