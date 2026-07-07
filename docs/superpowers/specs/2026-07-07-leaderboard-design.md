# Team Leaderboard — Design

**Issue:** #7 · **Date:** 2026-07-07 · **Status:** Approved

A ranked view of rep performance on the dashboard, visible to reps — the Lead
Scout "leaderboard" parity gap. Built entirely on existing data; no schema or
API changes.

## Decisions

- **Ranked by doors knocked** (total visits logged) — rewards the input reps
  control. Conversations and Sales are shown as columns but never change the
  ranking.
- **Full team list**, zero-visit reps included; the current user's row is
  highlighted.
- **Houses and businesses both count** — `visits UNION ALL business_visits`.
- **Week / Month tab toggle**; week is the default tab.
- **All three dashboards** render it: rep → own team, manager → own team
  (below the existing per-rep table), admin → all reps (cross-team). A rep or
  manager with no team sees no leaderboard section.

## Data

New in `lib/stats.ts`:

```ts
export type LeaderboardRow = {
  id: string
  name: string | null
  doors_week: string
  conversations_week: string
  sales_week: string
  doors_month: string
  conversations_month: string
  sales_month: string
}

export async function getLeaderboard(teamId: string | null): Promise<LeaderboardRow[]>
```

One SQL query (counts serialize as strings over neon-http, hence the string
fields — same convention as the existing stats types):

- Base: `users` where `role IS NOT NULL`, and `team_id = ${teamId}` when
  teamId is non-null.
- LEFT JOIN a UNION ALL subquery of `visits` and `business_visits`
  (columns: `user_id`, `contact_status`, `sale_outcome`, `created_at`).
- Six `COUNT(...) FILTER` columns: doors (all rows), conversations
  (`contact_status = 'answered'`), sales (`sale_outcome = 'sold'`), each ×
  `created_at >= date_trunc('week', CURRENT_DATE)` and
  `>= date_trunc('month', CURRENT_DATE)`.
- GROUP BY user; no ORDER BY needed (ranking is client-side via `rankRows`).

## Ranking

Pure helper `rankRows(rows, window)` exported from
`components/dashboard/Leaderboard.tsx`:

- Sort by doors desc for the given window, tie-break sales desc, then name
  asc (null names last) — deterministic.
- Returns rows with a `rank` number (1-based; ties share the metric but not
  the rank — plain positional ranking, no dense ranking).

## UI

`components/dashboard/Leaderboard.tsx` (`'use client'`, tab state only):

- Props: `{ rows: LeaderboardRow[]; currentUserId: string }`.
- Week / Month tab toggle styled like `MapStyleToggle` (bg-primary active).
- Table: rank (🥇🥈🥉 for 1–3, number otherwise), name ('Unknown' for null),
  Doors, Conversations, Sales — values for the selected window, coerced with
  `Number()`.
- Current user's row highlighted (`bg-muted font-medium`) with a "you" badge.
- Empty state: 'No team members yet.'

Dashboard wiring (`app/(app)/dashboard/page.tsx`):

- rep: `teamId ? await getLeaderboard(teamId) : null`, rendered below
  `RepStats`.
- manager: `getLeaderboard(teamId!)`, rendered below `ManagerStats`.
- admin: `getLeaderboard(null)`, rendered below `AdminStats`.
- Section heading "Leaderboard" above the component in each case; skipped
  entirely when rows are null.

The three dashboard components (`RepStats` etc.) are unchanged; the page
composes them with the new section.

## Error handling

None new — server-side query failures surface as the existing dashboard
error behavior (page-level). `rankRows` treats missing/NaN counts as 0.

## Testing

- Unit (`components/dashboard/Leaderboard.test.tsx`): `rankRows` ordering,
  tie-breaks (sales then name), window switching changes both sort and
  displayed values, NaN-as-0.
- Component: renders ranked order with medals, highlights `currentUserId`
  row with "you", tab toggle re-ranks, empty state.

## Out of scope

- Per-metric sort toggles, date-range selection (issue #9), streaks/awards,
  manager-configurable ranking metric.
