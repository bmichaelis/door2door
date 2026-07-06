# Prospect Statuses — Design

**Issue:** #2 · **Date:** 2026-07-02 · **Status:** Approved

One-tap settable status on houses and businesses, with an admin-customizable
status list and map pins colored by status. Closes the core parity gap with
Lead Scout's "Prospect Status" feature.

## Decisions

- **Hybrid model.** Logging a visit auto-sets a mapped status; reps can also
  set a status directly with one tap, no visit required. Status is the single
  source of pin color.
- **DNK stays separate.** `doNotKnock` / `noSolicitingSign` remain boolean
  flags with their existing permission rules. Flagged houses render black
  regardless of status; the log-visit confirmation warning is unchanged.
- **Scope: houses and businesses.** Both get `statusId` in this change.
- **One global list**, managed by admins at `/admin/statuses`.

## Data model

New `statuses` table:

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `name` | text not null | |
| `color` | text not null | hex, e.g. `#22c55e` |
| `sortOrder` | integer not null | chip/admin ordering |
| `active` | boolean default true | inactive = hidden from chips, kept on pins |
| `autoKey` | text nullable unique | `not_home \| interested \| callback \| customer \| not_interested` |
| `createdAt` | timestamp | |

- `houses.statusId` and `businesses.statusId`: nullable uuid FK →
  `statuses.id`, `on delete set null`. Null = never contacted = gray pin.
- **System rows** (`autoKey` not null) are seeded by migration and can be
  renamed, recolored, and reordered, but not deleted or deactivated. Custom
  rows (null `autoKey`) are fully editable and manual-only.

Seed rows (colors match today's derived pin colors in `HousePins.pinColor`):

| name | autoKey | color |
|---|---|---|
| Not Home | `not_home` | `#94a3b8` |
| Interested | `interested` | `#eab308` |
| Callback | `callback` | `#3b82f6` |
| Customer | `customer` | `#22c55e` |
| Not Interested | `not_interested` | `#ef4444` |

**Backfill:** the migration sets each house's `statusId` from its most recent
visit using the mapping below (houses → households → visits), and each
business's from `business_visits`, so the map looks identical on ship day.

## Auto-set mapping

Pure function in `lib/statuses.ts`, applied server-side in
`POST /api/visits` and `POST /api/business-visits` after the visit insert.
First match wins:

1. `saleOutcome = sold` → `customer`
2. `saleOutcome = follow_up` **or** `followUpAt` set → `callback`
3. `contactStatus = refused` or `interestLevel = not_interested` or
   `saleOutcome = not_sold` → `not_interested`
4. `interestLevel = interested | maybe` → `interested`
5. `contactStatus = not_home` → `not_home`

The key resolves to a status row by `autoKey`; if the row is missing,
auto-set is skipped silently. A later manual tap always overrides.

## API

- `GET /api/statuses` — all roles (map + chips need it).
  `POST /api/statuses`, `PATCH|DELETE /api/statuses/[id]` — admin only.
  Delete is blocked for system rows; deleting a custom row nulls referencing
  houses/businesses via the FK.
- `PATCH /api/houses/[id]` — accepts `statusId` (nullable to clear), allowed
  for all roles (one-tap must be frictionless).
- New `PATCH /api/businesses/[id]` route for the same (no per-id business
  route exists today).
- `GET /api/houses?bbox=` and `GET /api/businesses?bbox=` return `statusId`;
  the `lastOutcome` computation is removed — status is now the only pin-color
  input besides flags.

## UI

- **MapShell** fetches `/api/statuses` once alongside neighborhoods and passes
  a `statusId → color` lookup down to pins and panels.
- **HousePins / BusinessPins**: flagged → black; else status color; else gray
  (`#9ca3af`). Selection highlight ring unchanged.
- **HousePanel / BusinessPanel**: chip row of active statuses at the top of
  the detail view. Tap sets (or taps again to clear) via PATCH, optimistic
  through the existing `overrides` map in `MapShell`.
- **`/admin/statuses`**: admin CRUD page following the Products pattern —
  color swatch, rename, recolor from a preset palette (no free hex input),
  reorder, activate/deactivate, add custom status. System rows show an
  "auto: Sold" style badge and hide the delete action.
- **VisitForm** is unchanged; auto-set is server-side.

## Error handling

- Status PATCH failures surface in the panel's existing error banner and
  revert the optimistic chip state.
- Unknown/inactive `statusId` in a PATCH → 400.
- Auto-set failures never fail the visit insert (visit logging is the
  critical path); mapping errors are swallowed after the insert succeeds.

## Testing

- Unit (vitest, matching `lib/*.test.ts`): mapping function (all five rules +
  precedence + no-match), pin-color resolution, statuses API permission gates
  (admin vs rep), delete-blocked-for-system-rows.
- Component: chip row renders statuses in order, tap issues PATCH and updates
  selection (pattern of `MapStyleToggle.test.tsx`).
- Migration backfill verified against local data before merge.

## Out of scope

- Status filtering on the map (pairs with tags, issue #3).
- Per-team status lists.
- Status change history/audit trail.
