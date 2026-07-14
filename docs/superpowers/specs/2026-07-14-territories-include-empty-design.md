# Territories: show zero-house neighborhoods — Design

**Issue:** #23 · **Date:** 2026-07-14 · **Status:** Approved (user present;
`includeEmpty` param approach chosen).

## Why

`/territories` (management page) client-fetches `GET /api/neighborhoods`, which
filters `HAVING COUNT(h.id) > 0` to keep the map payload lean. A newly drawn
neighborhood with no imported houses is therefore invisible on the territories
page ("No neighborhoods yet." / it's absent from the list) and cannot be
assigned to a rep. Found by the #6 final review.

## Consumers of `GET /api/neighborhoods` (confirmed)

- `components/map/MapShell.tsx` — the prospecting map. Wants only neighborhoods
  with houses; the `HAVING` plus boundary simplification is a deliberate
  payload optimization (~6 MB → ~1 MB for 1428 polygons). Must stay unchanged.
- `app/(app)/territories/client.tsx` — the management page. Needs **all**
  neighborhoods including empty ones (uses `houseCount`, renders "N homes").
- Not affected: `admin/neighborhoods/page.tsx` runs its own server-side
  `SELECT ... FROM neighborhoods` (no `HAVING`) and already lists empties;
  `lib/stats.ts` has an unrelated neighborhoods query.

## Approach

**`?includeEmpty=1` opt-in query param** (chosen). The territories page requests
`GET /api/neighborhoods?includeEmpty=1`, which omits the `HAVING`; the map's
default call is unchanged and stays lean. Backwards-compatible, one endpoint.

Rejected: dropping the `HAVING` globally and filtering empties client-side on
the map — that re-bloats the map payload with every empty neighborhood's
boundary, undoing the optimization the `HAVING` exists for.

## Changes

### `app/api/neighborhoods/route.ts` — GET

- Read `includeEmpty` from the request URL's query params (truthy when present
  and not `'0'`/`'false'`).
- Build the HAVING as a conditional `sql` fragment: `HAVING COUNT(h.id) > 0`
  when NOT including empty, empty fragment when including. Interpolate it into
  the existing query. All else unchanged: columns, `ST_SimplifyPreserveTopology`,
  `GROUP BY`, `ORDER BY n.name`, and the `requireRole('admin','manager','rep')`
  gate.
- The handler signature gains access to the request. The current handler is
  `withErrorHandling(async () => {...})`; change to
  `withErrorHandling(async (req: NextRequest) => {...})` and read
  `new URL(req.url).searchParams.get('includeEmpty')` (matches the pattern in
  `app/api/houses/search/route.ts`).

### `app/(app)/territories/client.tsx`

- Change the neighborhoods fetch from `/api/neighborhoods` to
  `/api/neighborhoods?includeEmpty=1`. No other client change — the response
  shape is identical; empty neighborhoods arrive with `houseCount: 0` and their
  simplified boundary, and the existing `{n.houseCount} homes` renders "0 homes".

## Testing

- **Hermetic unit test** (new, e.g. `app/api/neighborhoods/route.test.ts` or a
  small helper test): build the query for both `includeEmpty` states, render via
  drizzle `PgDialect().sqlToQuery(...)`, and assert the rendered SQL **contains**
  `HAVING` in the default case and **does not** contain `HAVING` when including
  empties. (Same rendering technique used for #17's `ilikeAllTokens`.) This
  requires the HAVING-fragment construction to be reachable from the test —
  extract a small pure helper (e.g. `neighborhoodsListQuery(includeEmpty)`
  returning the `SQL`) if that keeps the handler clean; otherwise assert via the
  route harness capturing the executed `sql`.
- **Route-harness test** (the #16 harness): the handler returns the mocked rows
  and enforces the role gate on the `includeEmpty=1` path.

## Out of scope

Trimming `boundary` from the territories payload (territories is a list, not a
map — a later optimization; keeping the response shape identical is the minimal
fix); any change to the map or admin pages; the `assignedUserName` question
(#24).
