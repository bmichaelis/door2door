import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'
import { ownerType, toCsv, UTAH_BBOX } from './outreach-pack/lib.js'

const OUT = resolve('dist/utah-county-outreach-pack')
const ENV = `ST_MakeEnvelope(${UTAH_BBOX.w}, ${UTAH_BBOX.s}, ${UTAH_BBOX.e}, ${UTAH_BBOX.n}, 4326)`

async function main(): Promise<void> {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  const q = async (sql: string) => (await client.query(sql)).rows as Record<string, unknown>[]

  mkdirSync(OUT, { recursive: true })

  // addresses — houses within the Utah County bbox. single_family = has a
  // matched SFR owner (household). turf from the assigned neighborhood.
  const addresses = await q(`
    select h.external_id as address_id, h.number, h.street, h.unit, h.city, h.region, h.postcode,
           ST_Y(h.location) as lat, ST_X(h.location) as lng,
           (hh.id is not null) as single_family,
           n.id as turf_id, n.name as turf_name
    from houses h
    left join households hh on hh.house_id = h.id and hh.active
    left join neighborhoods n on n.id = h.neighborhood_id
    where ST_Within(h.location, ${ENV})
    order by h.postcode, h.street, h.number`)
  writeFileSync(resolve(OUT, 'addresses.csv'),
    toCsv(['address_id','number','street','unit','city','region','postcode','lat','lng','single_family','turf_id','turf_name'],
      addresses.map((r) => ({ ...r, single_family: r.single_family ? 'true' : 'false' }))))

  // owners — gated PII layer, keyed by address_id, only for bbox houses.
  const owners = await q(`
    select h.external_id as address_id, hh.surname, hh.head_of_household_name as first_name, hh.spouse_name
    from households hh
    join houses h on h.id = hh.house_id
    where hh.active and ST_Within(h.location, ${ENV})
    order by hh.surname`)
  writeFileSync(resolve(OUT, 'owners.csv'),
    toCsv(['address_id','surname','first_name','spouse_name','owner_type'],
      owners.map((r) => ({ ...r, owner_type: ownerType((r.first_name as string) ?? null) }))))

  // businesses — within the bbox.
  const businesses = await q(`
    select b.id as business_id, b.name, b.type, b.category, b.number, b.street, b.city, b.region, b.postcode,
           b.phone, b.website, ST_Y(b.location) as lat, ST_X(b.location) as lng, b.neighborhood_id as turf_id
    from businesses b
    where ST_Within(b.location, ${ENV})
    order by b.name`)
  writeFileSync(resolve(OUT, 'businesses.csv'),
    toCsv(['business_id','name','type','category','number','street','city','region','postcode','phone','website','lat','lng','turf_id'], businesses))

  // turf — neighborhood polygons intersecting the bbox, as GeoJSON.
  const turf = await q(`
    select n.id as turf_id, n.name as turf_name, n.city, ST_AsGeoJSON(n.boundary) as geometry
    from neighborhoods n
    where n.boundary is not null and ST_Intersects(n.boundary, ${ENV})`)
  const fc = {
    type: 'FeatureCollection',
    features: turf.map((r) => ({
      type: 'Feature',
      properties: { turf_id: r.turf_id, turf_name: r.turf_name, city: r.city },
      geometry: JSON.parse(r.geometry as string),
    })),
  }
  writeFileSync(resolve(OUT, 'turf.geojson'), JSON.stringify(fc))

  console.log(JSON.stringify({
    addresses: addresses.length,
    single_family: addresses.filter((r) => r.single_family).length,
    owners: owners.length,
    businesses: businesses.length,
    turf: turf.length,
  }, null, 2))

  await client.end()
}

main().catch((err) => { console.error(err); process.exitCode = 1 })
