# Importing County Data

This runbook covers the full pipeline for bootstrapping a new county deployment: neighborhoods from voting precincts, houses from OpenAddresses, and household names from county tax records. Run the steps in order — each step depends on the previous.

County-specific settings (AGRC county ID, city code mappings, file paths, field names) live in `config/<county>.json`. Adding a new county means creating a config file and downloading the data files — the scripts are fully generic.

**Existing configs:**
- `config/utah-county.json` — Utah County (AGRC ID 25)
- `config/salt-lake-county.json` — Salt Lake County (AGRC ID 18)

---

## Prerequisites

- `node --version` ≥ 18
- `ogr2ogr` available (`brew install gdal`)
- `DATABASE_URL` set in `.env.local`
- The data files listed in each step downloaded to `data/`

---

## Step 1 — Neighborhoods (Voting Precincts)

Voting precincts make good neighborhood boundaries because they are:
- Publicly maintained by the state
- Finer-grained than ZIP codes but coarser than census blocks
- Named in a recognizable city-precinct format (e.g., "Pleasant Grove 01")

**Source:** AGRC Open SGID (public PostGIS, no credentials needed)

```bash
node --env-file=.env.local scripts/import-precincts.js --county config/utah-county.json
node --env-file=.env.local scripts/import-precincts.js --county config/salt-lake-county.json
```

This script:
1. Connects to `opensgid.ugrc.utah.gov` and fetches all precincts for the county from `political.vista_ballot_areas`
2. Transforms geometry from UTM Zone 12N (SRID 26912) to WGS84 (4326)
3. **Deletes** all existing neighborhoods for the county's cities and clears house/business assignments
4. Inserts each precinct as a neighborhood named `"<City> <number>"` (e.g., `"Pleasant Grove 01"`)
5. Bulk re-assigns houses and businesses via spatial join (`ST_Within`)

City codes in AGRC's `precinctid` field are mapped to human-readable city names in the county config's `precincts.cities` section. Any unmapped codes are logged as warnings and skipped.

> **Warning:** This script replaces all existing neighborhoods for the configured cities. Do not run it if you have manually drawn neighborhood boundaries you want to keep.

---

## Step 2 — Houses (OpenAddresses)

**Source:** [openaddresses.io](https://openaddresses.io) — free pre-geocoded address data. Download the county collection.

Expected file path is set in the county config's `addresses.file` field. Override with `--file` if needed.

```bash
node --env-file=.env.local scripts/import-county-addresses.js --county config/utah-county.json
node --env-file=.env.local scripts/import-county-addresses.js --county config/salt-lake-county.json
```

This script:
1. Streams the file line-by-line to avoid loading it all into memory
2. Batches 500 records at a time
3. Performs a spatial join per batch to assign `neighborhood_id`
4. Uses `ON CONFLICT (external_id) DO NOTHING` — safe to re-run

**Expected output (Utah County full run):**
```
~243,000 lines → ~94,000 imported, ~149,000 skipped (already existed)
```

> **Note:** The `/admin/import` UI upload also works for smaller files but times out on Cloudflare Workers for county-scale files (>~10 MB). Always use this script for full-county imports.

---

## Step 3 — Households (Tax Parcels)

Tax records give us the owner's surname and first names for each residential parcel, which lets reps greet residents by name at the door.

**Source:** County Assessor GIS portal — download the Tax Parcels file geodatabase (`.gdb`). Place it at the path configured in the county config's `taxParcels.gdb` field.

- **Utah County:** download `TaxParcels.gdb` → `data/TaxParcels.gdb`
- **Salt Lake County:** download from the SL County Assessor GIS portal → `data/SaltLakeTaxParcels.gdb`

```bash
node --env-file=.env.local scripts/import-tax-parcels.js --county config/utah-county.json
node --env-file=.env.local scripts/import-tax-parcels.js --county config/salt-lake-county.json
```

This script:
1. Uses `ogr2ogr` to stream the parcel layer (filtered to single family residential)
2. Builds a normalized address string to match against the `houses` table
3. Extracts the **surname**, **first name**, and **spouse name** from the owner name field:
   - `"PATTERSON, MICHAEL A & LISBETH"` → surname `Patterson`, first `Michael`, spouse `Lisbeth`
   - `"MICHAELIS, BRETT AND NICOLE"` → surname `Michaelis`, first `Brett`, spouse `Nicole`
   - `"PATTERSON, MICHAEL A"` → surname `Patterson`, first `Michael`, spouse `null`
   - `"GREAT HEIGHTS VENTURES LLC"` → surname `Great Heights Ventures LLC`, first `null`, spouse `null`
4. Upserts into `households`: updates all name fields if a household exists, inserts a new one if not

**Name extraction rules:**
- Everything before the first comma → surname (title-cased)
- First word after the comma, before any middle initial or `&`/`AND` → first name (title-cased)
- First word after `&` or `AND` → spouse name (title-cased)
- No comma → treated as a business/entity, no names extracted

Re-running the script is safe — it upserts, not inserts.

> **Note:** If the county GDB uses different field names than the defaults (`OWNER_NAME`, `SITE_HOUSE_NUM`, etc.), update the `taxParcels` fields in the county config. Inspect the GDB with `ogrinfo -al -so <file>.gdb` to list available fields.

---

## Adding a new county

1. Copy an existing config and update `agrcCountyId`, city codes, and file paths
2. To discover the AGRC county ID, check the alphabetical position among Utah's 29 counties (e.g., Salt Lake = 18, Utah = 25)
3. To discover city codes, run: `node -e "const {Pool}=require('pg'); const p=new Pool({host:'opensgid.ugrc.utah.gov',port:5432,database:'opensgid',user:'agrc',password:'agrc',ssl:false}); p.query('SELECT DISTINCT precinctid FROM political.vista_ballot_areas WHERE countyid=$1 ORDER BY precinctid',[<ID>]).then(r=>{const codes=[...new Set(r.rows.map(x=>x.precinctid.replace(/[0-9]+$/,'')))]; console.log(codes.join('\n')); p.end()})"`
4. Download OpenAddresses data and the county tax GDB
5. Run steps 1–3 with the new config

---

## Re-running after a precinct refresh

If you re-run Step 1 (precincts), you do **not** need to re-run Steps 2 or 3. The precinct script handles re-assigning existing houses and businesses to the new boundaries.

If you re-run Step 2 (addresses), new houses won't have households. Run Step 3 afterward to populate names for the new records.
