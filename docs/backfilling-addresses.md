# Backfilling Business Addresses from Utah SGID

After importing businesses from Overture Maps, most will already have addresses. For any that don't (or if you import from OSM which has poor address coverage), you can backfill from the Utah SGID address points dataset.

## When to use this

Check how many businesses are missing addresses:

```sql
SELECT COUNT(*) FROM businesses WHERE street IS NULL;
```

If the number is small, it may not be worth the effort. Overture Maps handles most cases.

## Process

### 1. Download Utah Address Points

Go to [opendata.gis.utah.gov](https://opendata.gis.utah.gov), click **Lo** (Location), find **Utah Address Points**, and download as **CSV**.

To limit to Utah County (where Orem/Provo are), filter by county before downloading if the option is available — the statewide file is ~1.5M rows.

### 2. Create a staging table in Neon

Run this in the [Neon console](https://console.neon.tech) SQL editor:

```sql
CREATE TABLE IF NOT EXISTS _sgid_address_points (
  full_address  text,
  address_number text,
  street_name   text,
  city          text,
  zip_code      text,
  longitude     float8,
  latitude      float8
);
```

> Column names may vary — check the CSV headers and adjust accordingly.

### 3. Import the CSV

Use the Neon console's **Import** tab to upload the CSV into `_sgid_address_points`, or use `psql`:

```bash
psql $DATABASE_URL -c "\copy _sgid_address_points FROM 'AddressPoints.csv' CSV HEADER"
```

### 4. Add a spatial index

```sql
ALTER TABLE _sgid_address_points
  ADD COLUMN location geometry(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_Point(longitude, latitude), 4326)) STORED;

CREATE INDEX ON _sgid_address_points USING gist(location);
```

### 5. Backfill missing addresses

This finds the nearest SGID address point for each business that has no street, within 50 metres:

```sql
UPDATE businesses b
SET
  number = a.address_number,
  street = a.street_name,
  city   = COALESCE(b.city, a.city),
  postcode = COALESCE(b.postcode, a.zip_code)
FROM LATERAL (
  SELECT address_number, street_name, city, zip_code
  FROM _sgid_address_points
  ORDER BY location <-> b.location
  LIMIT 1
) a
WHERE b.street IS NULL
  AND ST_DWithin(b.location, a.location, 50);
```

The `ST_DWithin(..., 50)` guard (50 metres) prevents matching a business to a distant address if there's no nearby point in the dataset.

### 6. Clean up

```sql
DROP TABLE _sgid_address_points;
```

## Notes

- The nearest address point is a parcel centroid, not necessarily the exact business entrance, but it's close enough for display purposes.
- Run `SELECT COUNT(*) FROM businesses WHERE street IS NULL` again after the update to see how many remain unmatched.
- Remaining unmatched businesses are likely in areas with no SGID coverage (new developments, rural edges). Those can be left as-is or manually edited.
