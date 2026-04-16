# Importing Utah County Data

This runbook covers the full pipeline for bootstrapping a new county deployment: neighborhoods from voting precincts, houses from OpenAddresses, and household names from county tax records. Run the steps in order — each step depends on the previous.

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
node --env-file=.env.local scripts/import-precincts.js
```

This script:
1. Connects to `opensgid.ugrc.utah.gov` and fetches all Utah County precincts from `political.vista_ballot_areas`
2. Transforms geometry from UTM Zone 12N (SRID 26912) to WGS84 (4326)
3. **Deletes** all existing neighborhoods for Utah County cities and clears house/business assignments
4. Inserts each precinct as a neighborhood named `"<City> <number>"` (e.g., `"Pleasant Grove 01"`)
5. Bulk re-assigns houses and businesses via spatial join (`ST_Within`)

**City codes** mapped in the script: AF, AL, BL, CF, CH, DR, EM, ER, FF, GE, GO, HI, LE, LI, MA, OR, PA, PG, PR, SA, SF, SP, SQ, SR, VI, WH (and NE/NW/SE/SW/SL/UL for unincorporated areas).

> **Warning:** This script replaces all existing neighborhoods for the mapped cities. Do not run it if you have manually drawn neighborhood boundaries you want to keep.

---

## Step 2 — Houses (OpenAddresses)

**Source:** [openaddresses.io](https://openaddresses.io) — free pre-geocoded address data. Download the Utah County collection.

Expected file: `data/utah-addresses-county.geojson` (NDJSON — one GeoJSON Feature per line)

```bash
node --env-file=.env.local scripts/import-county-addresses.js
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

The skipped count will be 0 on a fresh database.

> **Note:** The `/admin/import` UI upload also works for smaller files but times out on Cloudflare Workers for county-scale files (>~10 MB). Always use this script for full-county imports.

---

## Step 3 — Households (Tax Parcels)

Tax records give us the owner's surname and first name for each residential parcel, which lets reps greet residents by name at the door.

**Source:** Utah County Assessor — Tax Parcels GDB. Download from the county GIS portal as `TaxParcels.gdb` and place it at `data/TaxParcels.gdb`.

```bash
node --env-file=.env.local scripts/import-tax-parcels.js
```

This script:
1. Uses `ogr2ogr` to stream the `TaxParcel` layer (filtered to `SINGLE FAMILY RES`)
2. Builds a normalized address string to match against the `houses` table
3. Extracts the **surname**, **first name**, and **spouse name** from `OWNER_NAME`:
   - `"PATTERSON, MICHAEL A & LISBETH"` → surname `Patterson`, first `Michael`, spouse `Lisbeth`
   - `"MICHAELIS, BRETT AND NICOLE"` → surname `Michaelis`, first `Brett`, spouse `Nicole`
   - `"PATTERSON, MICHAEL A"` → surname `Patterson`, first `Michael`, spouse `null`
   - `"GREAT HEIGHTS VENTURES LLC"` → surname `Great Heights Ventures LLC`, first `null`, spouse `null`
4. Upserts into `households`: updates all name fields if a household exists, inserts a new one if not
5. Stores names in `head_of_household_name` and `spouse_name`

**Name extraction rules:**
- Everything before the first comma → surname (title-cased)
- First word after the comma, before any middle initial or `&`/`AND` → first name (title-cased)
- First word after `&` or `AND` → spouse name (title-cased)
- No comma → treated as a business/entity, no names extracted

Re-running the script is safe — it upserts, not inserts.

---

## Re-running after a precinct refresh

If you re-run Step 1 (precincts), you do **not** need to re-run Steps 2 or 3. The precinct script handles re-assigning existing houses and businesses to the new boundaries.

If you re-run Step 2 (addresses), new houses won't have households. Run Step 3 afterward to populate names for the new records.
