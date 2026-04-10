#!/usr/bin/env node
// Converts orem-ut.svg neighborhood paths to GeoJSON using embedded calibration points.
// The SVG has reference circles with class="lat|lng" that let us compute an exact
// affine transform from SVG pixel coordinates to WGS84 lat/lng.

const fs = require('fs')
const path = require('path')

const svgPath = path.join(__dirname, '..', 'orem-ut.svg')
const svg = fs.readFileSync(svgPath, 'utf8')

// ── 1. Extract calibration reference points ──────────────────────────────────
// These circles have class="lat|lng" (e.g. class="40.258|-111.751")
const calRegex = /<circle class="([\d.]+\|[-\d.]+)" cx="([\d.]+)" cy="([\d.]+)"/g
const refPoints = []
let m
while ((m = calRegex.exec(svg)) !== null) {
  const [lat, lng] = m[1].split('|').map(Number)
  refPoints.push({ x: Number(m[2]), y: Number(m[3]), lat, lng })
}
console.error(`Found ${refPoints.length} calibration points`)

// ── 2. Least-squares affine transform ────────────────────────────────────────
// lat = a0 + a1*x + a2*y
// lng = b0 + b1*x + b2*y
function leastSquares(pts, getVal) {
  const n = pts.length
  let S1 = 0, Sx = 0, Sy = 0, Sxx = 0, Sxy = 0, Syy = 0
  let Sv = 0, Svx = 0, Svy = 0
  for (const p of pts) {
    const { x, y } = p; const v = getVal(p)
    S1 += 1; Sx += x; Sy += y
    Sxx += x * x; Sxy += x * y; Syy += y * y
    Sv += v; Svx += v * x; Svy += v * y
  }
  // Normal equations: A * [a0,a1,a2]^T = b
  const A = [
    [S1,  Sx,  Sy,  Sv ],
    [Sx,  Sxx, Sxy, Svx],
    [Sy,  Sxy, Syy, Svy],
  ]
  // Gaussian elimination with partial pivoting
  for (let col = 0; col < 3; col++) {
    let pivot = col
    for (let row = col + 1; row < 3; row++)
      if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
    [A[col], A[pivot]] = [A[pivot], A[col]]
    for (let row = col + 1; row < 3; row++) {
      const f = A[row][col] / A[col][col]
      for (let j = col; j <= 3; j++) A[row][j] -= f * A[col][j]
    }
  }
  const r = [0, 0, 0]
  for (let row = 2; row >= 0; row--) {
    r[row] = A[row][3]
    for (let col = row + 1; col < 3; col++) r[row] -= A[row][col] * r[col]
    r[row] /= A[row][row]
  }
  return r // [a0, a1, a2]
}

const [la0, la1, la2] = leastSquares(refPoints, p => p.lat)
const [lb0, lb1, lb2] = leastSquares(refPoints, p => p.lng)

// Verify fit: log max residual
let maxResLat = 0, maxResLng = 0
for (const p of refPoints) {
  maxResLat = Math.max(maxResLat, Math.abs(la0 + la1*p.x + la2*p.y - p.lat))
  maxResLng = Math.max(maxResLng, Math.abs(lb0 + lb1*p.x + lb2*p.y - p.lng))
}
console.error(`Transform residuals — lat: ${maxResLat.toExponential(2)}, lng: ${maxResLng.toExponential(2)}`)

function svgToGeo(x, y) {
  return [lb0 + lb1*x + lb2*y, la0 + la1*x + la2*y] // [lng, lat] for GeoJSON
}

// ── 3. Parse SVG paths ───────────────────────────────────────────────────────
const pathRegex = /<path d="([^"]+)" id="(\d+)" name="([^"]+)">/g
const neighborhoods = []
while ((m = pathRegex.exec(svg)) !== null)
  neighborhoods.push({ d: m[1], id: m[2], name: m[3] })
console.error(`Found ${neighborhoods.length} neighborhood paths`)

// ── 4. SVG path parser (handles M, l, z; all paths in this SVG use only these) ──
function parseSvgPath(d) {
  // Tokenize: split into command letters and numbers (handles "4.81-1.72" → ["4.81","-1.72"])
  const tokens = d.match(/[MLHVCSQTAZmlhvcsqtaz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)
  if (!tokens) return null

  const coords = []
  let x = 0, y = 0, startX = 0, startY = 0
  let cmd = 'M'
  let i = 0

  while (i < tokens.length) {
    const tok = tokens[i]
    if (/[MLHVCSQTAZmlhvcsqtaz]/.test(tok)) { cmd = tok; i++; continue }

    switch (cmd) {
      case 'M':
        x = Number(tokens[i]); y = Number(tokens[i+1]); i += 2
        startX = x; startY = y
        coords.push([x, y])
        cmd = 'L' // implicit lineto after M
        break
      case 'L':
        x = Number(tokens[i]); y = Number(tokens[i+1]); i += 2
        coords.push([x, y])
        break
      case 'l':
        x += Number(tokens[i]); y += Number(tokens[i+1]); i += 2
        coords.push([x, y])
        break
      case 'Z': case 'z':
        coords.push([startX, startY]) // close
        i++ // shouldn't be needed but guards infinite loop
        break
      default:
        i++ // skip unknown
    }
  }
  return coords
}

// ── 5. Build GeoJSON FeatureCollection ───────────────────────────────────────
const features = []
for (const nb of neighborhoods) {
  const svgCoords = parseSvgPath(nb.d)
  if (!svgCoords || svgCoords.length < 3) continue

  const ring = svgCoords.map(([x, y]) => svgToGeo(x, y))

  // Ensure closed ring
  const [fx, fy] = ring[0]
  const [lx, ly] = ring[ring.length - 1]
  if (fx !== lx || fy !== ly) ring.push([fx, fy])

  features.push({
    type: 'Feature',
    properties: { name: nb.name },
    geometry: { type: 'Polygon', coordinates: [ring] },
  })
}

const geojson = { type: 'FeatureCollection', features }

// Write GeoJSON file
const outPath = path.join(__dirname, '..', 'orem-neighborhoods.geojson')
fs.writeFileSync(outPath, JSON.stringify(geojson, null, 2))
console.error(`Wrote ${features.length} neighborhoods to ${outPath}`)

// Also write SQL for direct DB insertion (excluding "Unclassified")
const sqlLines = features
  .filter(f => f.properties.name !== 'Unclassified')
  .map(f => {
    const geom = JSON.stringify(f.geometry)
    const name = f.properties.name.replace(/'/g, "''")
    return `INSERT INTO neighborhoods (name, team_id, boundary) VALUES ('${name}', NULL, ST_SetSRID(ST_GeomFromGeoJSON('${geom}'), 4326));`
  })

const sqlPath = path.join(__dirname, '..', 'orem-neighborhoods.sql')
fs.writeFileSync(sqlPath, sqlLines.join('\n') + '\n')
console.error(`Wrote SQL to ${sqlPath}`)

// Print names
for (const f of features) {
  const pts = f.geometry.coordinates[0].length
  console.log(`${f.properties.name}: ${pts} points`)
}
