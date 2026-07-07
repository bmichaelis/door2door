# Per-Rep Territory Assignment — Design

**Issue:** #6 · **Date:** 2026-07-07 · **Status:** Approved (autonomous — user
offline, decisions delegated; review via PR)

Assign neighborhoods to individual reps with an upcoming/active/completed
lifecycle, visible on the map. Branch is STACKED on `worktree-4-photos`
(migration ordering); PR targets that branch.

## Decisions made autonomously (with rationale)

- **Two columns on `neighborhoods`, not an assignments table.** The issue
  sketched an `assignments` join table for reassignment history; v1 ships
  `assigned_user_id` + `territory_status` columns instead. Rationale: with
  the user offline, the smallest defensible surface wins — history is
  additive later (a table can be introduced and backfilled), while the
  columns cover every v1 behavior (assign, reassign, lifecycle, map tint).
- **One rep per neighborhood** (a single FK column enforces it) — the
  issue's "eliminate overlap" lean.
- **No knock-outside-your-territory warning in v1** — deferred with the
  issue's other soft ideas (auto-complete suggestion at coverage %).
- **Completed ≠ locked**: status is informational; reps can still work a
  completed territory.
- **Colors**: current-rep active = stronger blue fill; current-rep
  upcoming = violet; completed (anyone's) = gray, faint; everything else
  keeps today's look. Green is avoided (sold-pin color).

## Data model

Migration `0013_territories` (journal `when` = `1783437652444`, exceeds
0012's `1783435612577`): add to `neighborhoods`:

- `assigned_user_id` uuid NULL REFERENCES users(id) ON DELETE SET NULL
- `territory_status` text NULL (enum in Drizzle: `upcoming|active|completed`;
  NULL = no lifecycle set)

Index: `neighborhoods_assigned_user_idx` on `assigned_user_id`.

## API

- `GET /api/neighborhoods` — SELECT gains `n.assigned_user_id AS
  "assignedUserId"`, `n.territory_status AS "territoryStatus"`, `u.name AS
  "assignedUserName"` via `LEFT JOIN users u ON u.id = n.assigned_user_id`
  (add `u.name` to GROUP BY).
- `PATCH /api/neighborhoods/[id]` — top gate widens to
  `requireRole('admin','manager')`. Existing fields (`name`, `city`,
  `teamId`, `boundary`) remain admin-only (403 for managers). New fields
  `assignedUserId` (uuid or null) and `territoryStatus`
  (`upcoming|active|completed` or null; else 400) are allowed for admin, or
  for a manager when `canManageTeam(user, neighborhood.teamId)` (load the
  neighborhood first; 404 unknown; 403 otherwise).

## UI

- **`/territories` page** (nav entry roles `['admin','manager']`, placed
  after Appointments): server component gates the role, renders a client
  `TerritoriesClient` that fetches `/api/neighborhoods` + `/api/users`.
  Manager sees only their team's neighborhoods; admin sees all (sorted by
  name, with team name column for admin via the users/teams the client
  already has — omit team column in v1, sort suffices). Each row: name,
  house count, assignee `<select>` (reps whose `teamId` matches the
  neighborhood's team; admin sees all reps), status `<select>` (—, Upcoming,
  Active, Completed). Changes PATCH immediately; row disabled while saving;
  API errors surface in a banner. Empty state: 'No neighborhoods yet.'
- **Map tint** (`NeighborhoodLayer`): props gain `currentUserId: string`;
  feature properties gain `assignedUserId`/`territoryStatus`; data-driven
  `fill-color`/`fill-opacity`: mine+active `#3b82f6` @ 0.25; mine+upcoming
  `#8b5cf6` @ 0.18; completed `#9ca3af` @ 0.05; default unchanged
  (`#3b82f6` @ 0.1). `MapShell` passes `currentUser.id` through `MapView`.

## Testing

- Component test for `TerritoriesClient` (mocked fetch): renders rows,
  manager filtering, assignee change PATCHes, invalid-status impossible via
  select, error banner, empty state.
- Pure helper `repOptionsFor(neighborhood, users, role)` unit-tested
  (team-matched reps for manager, all reps for admin).
- Schema tests per convention. Map expression verified by build + smoke.

## Out of scope

Assignment history, overlap analytics, knock-warnings, auto-complete
suggestions, rep default-focus on their territory.
