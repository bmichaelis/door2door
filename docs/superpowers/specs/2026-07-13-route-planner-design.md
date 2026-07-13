# Route Planner — Design

**Date:** 2026-07-13
**Status:** Approved (design) — pending implementation plan

## Goal

Let a canvasser select businesses on the door2door map, compute an optimal
driving order, and hand off to Google Maps navigation with the stops in that
order. Closes the "Route Planner" gap vs the 9×12 Lead Scout tool.

## Context

door2door already has the geo foundation: Mapbox (`NEXT_PUBLIC_MAPBOX_TOKEN`,
used by `lib/mapbox.ts` for geocoding), a map stack (`MapShell`, `BusinessPins`,
`BusinessPanel`, `LocateMeButton`, neighborhoods/territories), businesses stored
as PostGIS `location` points (read as `ST_Y`=lat / `ST_X`=lng), and `users`
carrying `lastLat`/`lastLng`. The Optimization API uses the same Mapbox token.
Issue #16's route-*test-harness* (API-handler testing) is unrelated to routing.

## Decisions

1. **Targets:** businesses only (v1).
2. **Selection:** both — map multi-select (tap pins) and filter/set-based
   (route the businesses currently shown under the active neighborhood/status
   filter).
3. **Persistence:** ephemeral — plan on demand, open in Google Maps, nothing new
   stored (no route table).
4. **Optimization:** Mapbox Optimization API, with a nearest-neighbor fallback
   on any failure.
5. **Cap:** 10 stops (fits Mapbox's 12-coordinate limit and Google Maps'
   consumer-URL waypoint cap).
6. **Route shape:** one-way with both ends fixed — start = origin
   (`source=first`), end = the last selected stop (`destination=last`),
   `roundtrip=false`; the optimizer orders the intermediate stops. (Mapbox
   Optimization v1 does not support an optimizer-chosen endpoint with
   `roundtrip=false`; `destination=any` returns `NotImplemented`. Amended
   from the original "optimizer picks the end" after the final review.)

## Architecture & Components

**Pure libs (no deps, unit-tested):**
- `lib/route/geo.ts`
  - `haversineMeters(a: LatLng, b: LatLng): number`
  - `nearestNeighborOrder(start: LatLng, stops: Stop[]): Stop[]` — greedy order
  - `nearestN(start: LatLng, stops: Stop[], n: number): Stop[]` — closest n
- `lib/route/google-maps-url.ts`
  - `buildGoogleMapsDirUrl(start: LatLng, ordered: Stop[]): string` — returns
    `https://www.google.com/maps/dir/?api=1&origin=lat,lng&destination=lat,lng&waypoints=lat,lng|…&travelmode=driving`,
    stops in the given order (origin = start, destination = last stop,
    the rest = waypoints). No API call; cannot fail.

Types: `type LatLng = { lat: number; lng: number }`;
`type Stop = { id: string; name: string; lat: number; lng: number }`.

**Server:**
- `lib/route/optimize.ts`
  - `optimizeOrder(start: LatLng, stops: Stop[]): Promise<Stop[]>` — calls
    `GET https://api.mapbox.com/optimized-trips/v1/mapbox/driving/{lng,lat;…}?source=first&destination=last&roundtrip=false&access_token=…`
    (start first in the coordinate list), reorders `stops` by the response's
    `waypoints[i].waypoint_index`. On non-200/timeout/network error, or a
    200 response whose body `code !== 'Ok'` (e.g. `NotImplemented`) →
    `nearestNeighborOrder(start, stops)`. Coordinate order is `lng,lat` for
    Mapbox; the lib owns the conversion so callers pass `{lat,lng}`.
- `app/api/route/optimize/route.ts` — POST handler.
  - Body: `{ start: LatLng, stops: Stop[] }`. Validates `2 <= stops.length <= 10`.
  - Returns `{ orderedStops: Stop[], googleMapsUrl: string }`.
  - Auth: same session guard as other app API routes. Testable via the #16
    route-harness.

**Client UI (existing Mapbox map shell):**
- A **"Plan route"** mode toggle. In this mode, tapping a `BusinessPin` toggles
  it into a selection tray (map multi-select); blocked at 10 with a toast.
- A **"Route these"** action over the businesses currently shown on the map
  (active neighborhood/status filter) — the filter path; if >10, `nearestN`
  trims to the closest 10 to the start.
- A **`RoutePanel`** component: start-point control (current-GPS button reusing
  the `LocateMeButton`/`navigator.geolocation` pattern, falling back to
  `user.lastLat/lng`; plus an address field → existing `geocodeAddress`), the
  numbered ordered stops (also drawn on the map), and **Plan route** →
  **Open in Google Maps** buttons.

## Data Flow

**Map multi-select:**
1. Enter Plan-route mode → tap ≤10 pins → tray fills.
2. Set start (GPS default → `lastLat/lng` fallback → typed address).
3. Plan route → POST `{ start, stops }` to `/api/route/optimize`.
4. Server `optimizeOrder` (Mapbox → fallback) → `{ orderedStops, googleMapsUrl }`.
5. `RoutePanel` shows the numbered order + draws it; **Open in Google Maps**
   opens the URL (deep-links to the app on mobile).

**Filter/set-based:** same, but step 1 routes the businesses already loaded on
the map under the active filter; start is set first so `nearestN(start, set, 10)`
can trim before optimizing.

## Error Handling

- **Mapbox Optimization fails** (non-200 / timeout / network) → silent
  `nearestNeighborOrder` fallback + server log; the feature never hard-fails.
- **<2 stops** → "Add at least 2 stops." **>10 (multi-select)** → prevented at
  tap; **(filter)** → trimmed to nearest 10 with a note.
- **GPS denied** → fall back to `user.lastLat/lng`; else prompt for an address.
  **Geocode miss** → "Couldn't find that address."
- The Google Maps URL is a pure string build — it cannot fail.

## Testing

- **Pure libs:** `geo.ts` (haversine distances, nearest-neighbor order,
  `nearestN` trim); `google-maps-url.ts` (exact URL shape, order preserved,
  `lat,lng` encoding + `|`-joined waypoints).
- **`optimize.ts`:** mocked `fetch` — Mapbox success reorders by
  `waypoint_index`; Mapbox failure falls back to nearest-neighbor.
- **API route:** via the #16 route-harness — valid input → ordered + URL;
  too few / too many → error; auth enforced.
- **UI:** verified by lint + build; the map interaction is a documented manual
  smoke (select pins → plan → open in Google Maps).

## Out of Scope (future)

- Houses, and mixed business+house routes.
- Saved/named routes (persistence) and resuming runs.
- Chunking a set of >10 into multiple sequential routes (v1 trims to 10).
- Round-trip / return-to-start option.
- In-app turn-by-turn (we hand off to Google Maps).

## Open Questions

None — resolved during brainstorming.
