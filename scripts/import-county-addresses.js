#!/usr/bin/env node
// Imports all Utah County addresses from the OpenAddresses county GeoJSON file.
// Skips records already in the DB (conflict on external_id).
// Assigns neighborhood_id via spatial join on import.
// Run: node --env-file=.env.local scripts/import-county-addresses.js

const fs = require('fs')
const readline = require('readline')
const { Pool } = require('pg')

const BATCH_SIZE = 500
const INPUT_FILE = 'data/utah-addresses-county.geojson'

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  const rl = readline.createInterface({
    input: fs.createReadStream(INPUT_FILE),
    crlfDelay: Infinity,
  })

  let batch = []
  let totalImported = 0
  let totalSkipped = 0
  let totalLines = 0

  async function flushBatch() {
    if (!batch.length) return

    // Spatial join: find neighborhood_id for each point in the batch
    const pointValues = batch.map((r, i) =>
      `(${i}::int, ${r.lng}::float8, ${r.lat}::float8)`
    ).join(', ')

    const { rows: nbhdRows } = await pool.query(`
      WITH points (idx, lng, lat) AS (VALUES ${pointValues})
      SELECT p.idx, n.id AS neighborhood_id
      FROM points p
      LEFT JOIN LATERAL (
        SELECT id FROM neighborhoods
        WHERE ST_Within(ST_SetSRID(ST_Point(p.lng, p.lat), 4326), boundary)
        LIMIT 1
      ) n ON true
    `)

    const neighborhoodIds = new Map()
    for (const row of nbhdRows) {
      neighborhoodIds.set(Number(row.idx), row.neighborhood_id ?? null)
    }

    // Build bulk insert
    const valuePlaceholders = []
    const params = []
    let p = 1
    for (let i = 0; i < batch.length; i++) {
      const r = batch[i]
      const nbhd = neighborhoodIds.get(i) ?? null
      valuePlaceholders.push(
        `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, ST_SetSRID(ST_Point($${p++}, $${p++}), 4326), $${p++})`
      )
      params.push(r.number, r.street, r.unit || null, r.city, r.region, r.postcode, r.externalId, r.lng, r.lat, nbhd)
    }

    const result = await pool.query(`
      INSERT INTO houses (number, street, unit, city, region, postcode, external_id, location, neighborhood_id)
      VALUES ${valuePlaceholders.join(', ')}
      ON CONFLICT (external_id) DO NOTHING
      RETURNING id
    `, params)

    totalImported += result.rowCount
    totalSkipped += batch.length - result.rowCount
    batch = []
  }

  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) continue
    totalLines++

    let feature
    try {
      feature = JSON.parse(trimmed)
    } catch {
      continue
    }

    if (feature?.type !== 'Feature') continue
    const props = feature.properties ?? {}
    const coords = feature.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) continue
    if (!props.number || !props.street) continue

    batch.push({
      number: String(props.number),
      street: String(props.street),
      unit: String(props.unit ?? ''),
      city: String(props.city ?? ''),
      region: String(props.region ?? ''),
      postcode: String(props.postcode ?? ''),
      externalId: String(props.hash ?? ''),
      lng: Number(coords[0]),
      lat: Number(coords[1]),
    })

    if (batch.length >= BATCH_SIZE) {
      await flushBatch()
      process.stdout.write(`\r  processed ${totalLines.toLocaleString()} lines — imported ${totalImported.toLocaleString()}, skipped ${totalSkipped.toLocaleString()}`)
    }
  }

  await flushBatch()

  process.stdout.write('\n')
  console.log(`Done. ${totalLines.toLocaleString()} lines → ${totalImported.toLocaleString()} imported, ${totalSkipped.toLocaleString()} skipped (already existed).`)
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
