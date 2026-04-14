# Importing Businesses

Businesses are imported from [Overture Maps](https://overturemaps.org/), which combines data from Foursquare, Meta, Microsoft, and others. Coverage and addresses are significantly better than OpenStreetMap alone.

## One-time setup

```bash
brew install pipx
pipx install overturemaps
```

## Adding a new city

### 1. Find the bounding box

Go to [bboxfinder.com](http://bboxfinder.com), draw a rectangle around the city, and copy the coordinates shown at the bottom. Format is: `west,south,east,north`.

### 2. Download the data

```bash
overturemaps download \
  --bbox=<west>,<south>,<east>,<north> \
  -f geojson --type=place \
  -o <city>_places.geojson
```

**Known bounding boxes:**

| City | bbox |
|------|------|
| Orem + Provo | `-111.75,40.18,-111.61,40.36` |

Add rows here as you import new cities.

### 3. Import

Go to `/admin/businesses` and upload the `.geojson` file under **Overture Maps**. The import is idempotent — re-running the same city will update existing records, not create duplicates.

## Notes

- The importer filters out features with confidence < 0.4 (likely spam/duplicates).
- Businesses are automatically assigned to a neighborhood if their coordinates fall within a neighborhood boundary. Businesses outside any boundary are imported with `neighborhood_id = null` and won't appear on the map until a neighborhood is drawn around them.
- OSM import is also available on the same page for cases where Overture coverage is thin, but Overture is preferred.
