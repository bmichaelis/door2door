# Team Activity Map (Phase 1: Activity Trail) — Design

**Issue:** #8 · **Date:** 2026-07-07 · **Status:** Approved (autonomous — user
offline, decisions delegated; review via PR)

The issue's own phasing: ship an **activity trail from existing visit data
first**; live GPS second, only if actually wanted (it carries privacy/consent
questions the user must answer). This branch is phase 1 only. STACKED on
`worktree-6-territories`; PR targets that branch.

## Decisions made autonomously (with rationale)

- **No GPS, no new tables, no migration.** Every visit already records who,
  where (via the entity's location), and when — today's visits ARE the
  activity trail. Live tracking (deferred) needs the user's consent-policy
  call per the issue.
- **Manager/admin only.** The layer answers "where has my team worked
  today?" — a management question. The API is role-gated
  (`requireRole('admin','manager')`); reps never see the toggle.
- **Today only** (`created_at >= CURRENT_DATE`), matching the "today's
  activity" framing; date ranges belong to reports (#9).
- **Color per rep** from a fixed 8-color palette assigned by stable order
  (sorted user ids), with a legend chip row so colors are decodable. Palette
  avoids pin-semantic colors where possible.

## API

`GET /api/activity` — admin/manager (`requireRole`); manager team-scoped,
admin all. One UNION query over `visits` + `business_visits` joined to the
entity for coordinates:

```
{ userId, repName, lat, lng, at }[]   // at = created_at as zone-less ISO
```

- visits → `houses.location`; business_visits → `businesses.location`.
- `WHERE v.created_at >= CURRENT_DATE`; manager: `AND u.team_id = ${teamId}`
  (rep-style fallback is moot — route is not rep-accessible; a teamless
  manager gets an empty list via `u.team_id = NULL` never matching).
- `at` uses `to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS')` — the timezone lesson
  from the appointments branch, applied from day one.
- Ordered by `at` ascending. Includes the rep's own visits for managers.

## Client

- `lib/activity.ts` (client-safe): `type ActivityPoint`; `repPalette(points):
  Map<userId, color>` — stable assignment: unique userIds sorted, mapped onto
  `ACTIVITY_COLORS` (8 hex values, cycling). Pure, unit-tested.
- `components/map/ActivityLayer.tsx`: geojson circle layer (`radius 5`,
  white stroke, color from feature property) — presentational, given points
  + palette.
- `MapShell`: when `currentUser.role !== 'rep'`, render an "Activity" toggle
  in the existing layers chip group (`homes | businesses | activity`).
  Toggling on fetches `/api/activity` once per map session (cached in state;
  re-fetch on each toggle-on is fine and simpler — decision: fetch on every
  toggle-on, AbortController, errors ignored silently like sibling layer
  fetches). Legend: when active and points exist, a chip row above the
  bottom-left controls listing rep name + color dot.
- `MapView`: renders `<ActivityLayer>` when the layer is visible, beneath
  pins (declared before HousePins so pins stay tappable on top).
  `LayerVisibility` gains `activity: boolean` — MapShell initializes it
  `false` and omits the chip for reps.

## Testing

- Unit: `repPalette` (stability across order, cycling past 8, empty).
- Component: `ActivityLayer` renders a Source/Layer with feature per point
  (same shallow style as other layer components — they are not currently
  unit-tested; skip if react-map-gl mocking proves disproportionate and note
  it). The toggle/legend logic lives in MapShell (untested, matching MapShell
  precedent).
- Route uninspectable (issue #16); tsc + build + smoke.

## Out of scope

Live GPS positions (phase 2 — needs the user's consent decision), historical
date ranges (#9 reports), per-visit popups, heatmap rendering.
