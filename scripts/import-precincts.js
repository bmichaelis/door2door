#!/usr/bin/env node
// Imports voting precincts from AGRC Open SGID as neighborhoods.
// Run: node --env-file=.env.local scripts/import-precincts.js --county config/utah-county.json

const { Pool } = require('pg')
const fs = require('fs')

function parseArgs() {
  const args = process.argv.slice(2)
  const countyFlag = args.indexOf('--county')
  if (countyFlag < 0 || !args[countyFlag + 1]) {
    console.error('Usage: import-precincts.js --county <config-file>')
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(args[countyFlag + 1], 'utf8'))
}

async function main() {
  const county = parseArgs()
  const { agrcCountyId, name: countyName, precincts: { cities: CITY_CODES } } = county

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const agrc = new Pool({
    host: 'opensgid.ugrc.utah.gov',
    port: 5432,
    database: 'opensgid',
    user: 'agrc',
    password: 'agrc',
    ssl: false,
  })

  // 1. Fetch all precincts for this county with WGS84 polygon geometry
  console.log(`Fetching ${countyName} precincts from AGRC Open SGID...`)
  const { rows: precincts } = await agrc.query(`
    SELECT
      precinctid,
      ST_AsGeoJSON(
        ST_Force2D(ST_GeometryN(ST_Transform(shape, 4326), 1))
      )::json AS geojson
    FROM political.vista_ballot_areas
    WHERE countyid = $1
    ORDER BY precinctid
  `, [agrcCountyId])
  await agrc.end()
  console.log(`  → ${precincts.length} precincts fetched`)

  // Extract city code from precinctid: strip leading digits (county prefix) then read non-digit prefix
  function extractCityCode(precinctid) {
    const stripped = precinctid.replace(/^\d+/, '')
    const m = stripped.match(/^([A-Z]+)/)
    return m ? m[1] : null
  }

  // Warn about any codes not in the config
  const unknownCodes = new Set()
  for (const row of precincts) {
    const code = extractCityCode(row.precinctid)
    if (code && !CITY_CODES[code]) unknownCodes.add(code)
  }
  if (unknownCodes.size > 0) {
    console.warn(`  ⚠ Unknown city codes (add to config to name them): ${[...unknownCodes].join(', ')}`)
  }

  // 2. Delete existing neighborhoods for this county's cities (and clear house/business assignments)
  const allCities = [...new Set(Object.values(CITY_CODES).map(v => v.city))]
  console.log('Clearing existing neighborhoods...')
  await pool.query(
    `UPDATE houses SET neighborhood_id = NULL
     WHERE neighborhood_id IN (SELECT id FROM neighborhoods WHERE city = ANY($1))`,
    [allCities]
  )
  await pool.query(
    `UPDATE businesses SET neighborhood_id = NULL
     WHERE neighborhood_id IN (SELECT id FROM neighborhoods WHERE city = ANY($1))`,
    [allCities]
  )
  const { rowCount: deleted } = await pool.query(
    `DELETE FROM neighborhoods WHERE city = ANY($1)`,
    [allCities]
  )
  console.log(`  → ${deleted} old neighborhoods removed`)

  // 3. Insert precincts as neighborhoods
  console.log('Inserting precinct neighborhoods...')
  let inserted = 0
  let skipped = 0
  for (const row of precincts) {
    const code = extractCityCode(row.precinctid)
    const info = CITY_CODES[code]
    if (!info) { skipped++; continue }

    // Precinct number is everything after the city code (with leading digits stripped from id)
    const stripped = row.precinctid.replace(/^\d+/, '')
    const num = stripped.replace(/^[A-Z]+/, '')
    const name = `${info.label} ${num}`

    await pool.query(
      `INSERT INTO neighborhoods (name, city, boundary)
       VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326))`,
      [name, info.city, JSON.stringify(row.geojson)]
    )
    inserted++
  }
  console.log(`  → ${inserted} neighborhoods inserted, ${skipped} skipped (unmapped codes)`)

  // 4. Re-assign houses and businesses to precinct boundaries via spatial join
  const upperCities = allCities.map(c => c.toUpperCase())
  console.log('Re-assigning houses to precincts (this may take a minute)...')
  const { rowCount: assignedHouses } = await pool.query(
    `UPDATE houses
     SET neighborhood_id = (
       SELECT n.id FROM neighborhoods n
       WHERE ST_Within(houses.location, n.boundary)
       LIMIT 1
     )
     WHERE UPPER(city) = ANY($1)`,
    [upperCities]
  )
  console.log(`  → ${assignedHouses} houses assigned`)

  console.log('Re-assigning businesses to precincts...')
  const { rowCount: assignedBiz } = await pool.query(
    `UPDATE businesses
     SET neighborhood_id = (
       SELECT n.id FROM neighborhoods n
       WHERE ST_Within(businesses.location, n.boundary)
       LIMIT 1
     )
     WHERE neighborhood_id IS NULL`
  )
  console.log(`  → ${assignedBiz} businesses assigned`)

  await pool.end()
  console.log('Done.')
}

main().catch(err => { console.error(err); process.exit(1) })
