#!/usr/bin/env node
// Imports Utah County voting precincts from AGRC Open SGID as neighborhoods.
// Replaces all existing neighborhoods for Utah County cities with official precinct boundaries.
// Run: node --env-file=.env.local scripts/import-precincts.js

const { Pool } = require('pg')

// Maps 2-letter VISTA city code → { city: stored in neighborhoods.city, label: used in neighborhood name }
const CITY_CODES = {
  AF: { city: 'American Fork',    label: 'American Fork'    },
  AL: { city: 'Alpine',           label: 'Alpine'           },
  BL: { city: 'Bluffdale',        label: 'Bluffdale'        },
  CF: { city: 'Cedar Fort',       label: 'Cedar Fort'       },
  CH: { city: 'Cedar Hills',      label: 'Cedar Hills'      },
  DR: { city: 'Draper',           label: 'Draper'           },
  EM: { city: 'Eagle Mountain',   label: 'Eagle Mountain'   },
  ER: { city: 'Elk Ridge',        label: 'Elk Ridge'        },
  FF: { city: 'Fairfield',        label: 'Fairfield'        },
  GE: { city: 'Genola',           label: 'Genola'           },
  GO: { city: 'Goshen',           label: 'Goshen'           },
  HI: { city: 'Highland',         label: 'Highland'         },
  LE: { city: 'Lehi',             label: 'Lehi'             },
  LI: { city: 'Lindon',           label: 'Lindon'           },
  MA: { city: 'Mapleton',         label: 'Mapleton'         },
  NE: { city: 'Unincorporated',   label: 'Unincorporated NE'},
  NW: { city: 'Unincorporated',   label: 'Unincorporated NW'},
  OR: { city: 'Orem',             label: 'Orem'             },
  PA: { city: 'Payson',           label: 'Payson'           },
  PG: { city: 'Pleasant Grove',   label: 'Pleasant Grove'   },
  PR: { city: 'Provo',            label: 'Provo'            },
  SA: { city: 'Salem',            label: 'Salem'            },
  SE: { city: 'Unincorporated',   label: 'Unincorporated SE'},
  SF: { city: 'Spanish Fork',     label: 'Spanish Fork'     },
  SL: { city: 'Unincorporated',   label: 'Unincorporated S' },
  SP: { city: 'Springville',      label: 'Springville'      },
  SQ: { city: 'Santaquin',        label: 'Santaquin'        },
  SR: { city: 'Saratoga Springs', label: 'Saratoga Springs' },
  SW: { city: 'Unincorporated',   label: 'Unincorporated SW'},
  UL: { city: 'Unincorporated',   label: 'Unincorporated'   },
  VI: { city: 'Vineyard',         label: 'Vineyard'         },
  WH: { city: 'Woodland Hills',   label: 'Woodland Hills'   },
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const agrc = new Pool({
    host: 'opensgid.ugrc.utah.gov',
    port: 5432,
    database: 'opensgid',
    user: 'agrc',
    password: 'agrc',
    ssl: false,
  })

  // 1. Fetch all Utah County precincts with WGS84 polygon geometry
  console.log('Fetching Utah County precincts from AGRC Open SGID...')
  const { rows: precincts } = await agrc.query(`
    SELECT
      precinctid,
      SUBSTRING(precinctid, 3, 2)  AS city_code,
      SUBSTRING(precinctid, 5)     AS precinct_num,
      ST_AsGeoJSON(
        ST_Force2D(ST_GeometryN(ST_Transform(shape, 4326), 1))
      )::json AS geojson
    FROM political.vista_ballot_areas
    WHERE countyid = 25
    ORDER BY precinctid
  `)
  await agrc.end()
  console.log(`  → ${precincts.length} precincts fetched`)

  // 2. Delete existing Utah County neighborhoods (and clear house assignments first)
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
  for (const row of precincts) {
    const info = CITY_CODES[row.city_code]
    if (!info) {
      console.warn(`  Unknown city code: ${row.city_code} (precinctid=${row.precinctid})`)
      continue
    }
    const name = `${info.label} ${row.precinct_num}`
    await pool.query(
      `INSERT INTO neighborhoods (name, city, boundary)
       VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326))`,
      [name, info.city, JSON.stringify(row.geojson)]
    )
    inserted++
  }
  console.log(`  → ${inserted} neighborhoods inserted`)

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
