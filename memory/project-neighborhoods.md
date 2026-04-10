---
name: Neighborhood Data Setup
description: How Orem and Provo neighborhood boundaries were created, known pitfalls with DB insertion
type: project
---

22 Orem neighborhoods and 34 Provo neighborhoods are in the DB, tagged with `city` column ('Orem' / 'Provo').

**Why:** Imported from SVG maps via `scripts/svg-to-neighborhoods.js`, which uses calibration reference points (class="lat|lng" circles) to compute an affine transform from SVG pixel coords to WGS84.

**How to apply:** If neighborhoods ever need to be re-imported or corrected, always insert programmatically from the generated GeoJSON file — never manually copy-paste SQL. Manual copy-paste caused the first Provo batch to have 17 of 34 neighborhoods with wrong polygons (some off by 10+ km).

**Fix pattern used for Provo:**
1. `UPDATE houses SET neighborhood_id = NULL WHERE neighborhood_id IN (SELECT id FROM neighborhoods WHERE city = 'Provo')`
2. `DELETE FROM neighborhoods WHERE city = 'Provo'`
3. Re-insert from `provo-neighborhoods.geojson` with city='Provo'
4. `UPDATE houses h SET neighborhood_id = n.id FROM neighborhoods n WHERE ST_Within(h.location, n.boundary) AND h.neighborhood_id IS NULL`

**House import:** The GeoJSON import route (`/api/houses/import/geojson`) assigns `neighborhood_id` inline via lateral ST_Within join — no need to run the UPDATE separately after import.
