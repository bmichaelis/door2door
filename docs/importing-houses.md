# Importing Houses

Houses are imported via `/admin/import`. Two file formats are accepted depending on whether you have pre-geocoded data or just a list of addresses.

---

## Option A: GeoJSON (preferred — bulk, fast)

Use this when you have address data that already includes coordinates. The importer handles batches of 500 and uses 2 DB queries per batch regardless of size.

### File format

Newline-delimited GeoJSON — one `Feature` per line (not a FeatureCollection). Each feature must have:

```json
{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.693,40.234]},"properties":{"number":"123","street":"Main St","unit":"","city":"Provo","region":"UT","postcode":"84601","hash":"abc123"}}
```

Required properties: `number`, `street`  
Optional: `unit`, `city`, `region`, `postcode`, `hash` (used as `external_id` for deduplication)

### Where to get the data

**OpenAddresses** (openaddresses.io) is the source used for the initial Provo data load. It publishes free, pre-geocoded address data for Utah in exactly this format. Download the Utah dataset, filter to the county you need, and upload. The `hash` field in their output maps directly to our `external_id`, so re-importing the same file is safe (duplicates are skipped).

### Steps

1. Download the GeoJSON file for your city/county
2. Go to `/admin/import`
3. Select the `.geojson` file and click **Upload**

---

## Option B: CSV (small lists, auto-geocoded)

Use this for smaller imports where you only have addresses (no coordinates). Each address is geocoded individually via the Mapbox Geocoding API, so this is slow and consumes Mapbox API credits.

### File format

Plain text, one address per line, no header:

```
123 Main St, Provo, UT 84601
456 Center St, Provo, UT 84601
```

### Steps

1. Go to `/admin/import`
2. Select the `.csv` file and click **Upload**

> **Note:** The CSV importer processes 10 addresses at a time. For large imports (hundreds of addresses) use the GeoJSON path instead.

---

## Notes

- Both importers auto-assign `neighborhood_id` based on whether the house falls within a neighborhood boundary.
- Houses outside any neighborhood boundary are imported with `neighborhood_id = null` and will not appear on the map until a neighborhood is drawn around them.
- The GeoJSON importer uses `external_id` (from the `hash` property) for deduplication via `ON CONFLICT DO NOTHING`. The CSV importer does not deduplicate — re-uploading the same CSV will create duplicate records.
