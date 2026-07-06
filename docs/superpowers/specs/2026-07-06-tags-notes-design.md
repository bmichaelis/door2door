# Team-shared Tags & House-level Notes — Design

**Issue:** #3 · **Date:** 2026-07-06 · **Status:** Approved

Persistent, team-visible tags and notes on houses and businesses — facts about
the property ("dog in yard", "gate code 1234") as opposed to visit notes,
which record one interaction and stay unchanged. Closes the Lead Scout parity
gap for team-shared tags/notes.

## Decisions

- **Note stream, not a scratchpad.** Each note is its own row with author and
  timestamp. No note editing — delete and re-add covers it.
- **Reps create tags freely; admins curate.** Any role attaches existing tags
  or creates new ones from the field (typeahead nudges toward existing).
  Renaming or deleting a tag globally is admin-only.
- **Note deletion:** the author, or manager/admin.
- **Scope: houses and businesses**, same as prospect statuses.
- **Panel-only.** No pin badges; map filtering by tag/status is a future issue.

## Data model

Migration `0010_tags_notes`. Journal `when` MUST exceed 0009's
`1782950400000` — use the authoring-time epoch (see issue #14 for why).

`tags` (shared vocabulary):

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `name` | text not null | display casing preserved |
| `createdAt` | timestamp | |

Unique index on `lower(name)` so "Dog" and "dog" cannot fork. No color
column (YAGNI — chips render neutral).

`house_tags` and `business_tags` (identical shape):

| column | type | notes |
|---|---|---|
| `houseId` / `businessId` | uuid FK, on delete cascade | |
| `tagId` | uuid FK → tags, on delete cascade | |
| `userId` | uuid FK → users, nullable, on delete set null | who attached |
| `createdAt` | timestamp | |

Composite primary key (entity id, `tagId`) — attaching twice is a no-op
(`ON CONFLICT DO NOTHING`).

`house_notes` and `business_notes` (identical shape):

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `houseId` / `businessId` | uuid FK, on delete cascade | |
| `userId` | uuid FK → users, nullable, on delete set null | author |
| `body` | text not null | |
| `createdAt` | timestamp | |

## API

Flat query-param routes, matching the repo's existing style
(`/api/households?houseId=`). All routes edge runtime, `withErrorHandling`,
`requireRole('admin','manager','rep')` unless noted.

**Vocabulary:**
- `GET /api/tags?q=<text>` — typeahead: `name ILIKE '%q%'`, ordered by name,
  limit 10. Without `q`: full list (admin page uses this) with usage counts.
- `POST /api/tags` — `{ name }`; trims; if `lower(name)` exists, returns the
  existing row (200) instead of erroring; otherwise creates (201). Empty
  name → 400.
- `PATCH /api/tags/[id]` — admin only; rename with the same case-insensitive
  collision check (409 if another tag owns that name).
- `DELETE /api/tags/[id]` — admin only; cascades join rows. 204.

**Attachments** (mirrored as `/api/business-tags` with `businessId`):
- `GET /api/house-tags?houseId=` → `[{ tagId, name }]` ordered by name.
- `POST /api/house-tags` — `{ houseId, name }`: create-or-find the tag, then
  attach (`ON CONFLICT DO NOTHING`) — one round trip from the field. Returns
  the attached `{ tagId, name }`.
- `DELETE /api/house-tags?houseId=&tagId=` — any role. 204.

**Notes** (mirrored as `/api/business-notes` with `businessId`):
- `GET /api/house-notes?houseId=` → notes newest-first, each with
  `authorName` (join users; "Unknown" when userId null).
- `POST /api/house-notes` — `{ houseId, body }`; empty body → 400. 201.
- `DELETE /api/house-notes/[id]` — author or manager/admin, enforced by a new
  `canDeleteNote(user, note)` helper in `lib/permissions.ts`. 403 otherwise,
  204 on success.

## UI

Two shared components in `components/map/`, used by both panels:

- **`TagEditor`** — chips for attached tags, each with a remove ×; an "Add
  tag" affordance opening a small input; typing fires a debounced (250 ms)
  `GET /api/tags?q=` and shows suggestions; Enter or suggestion-tap attaches
  (creating if new). Optimistic attach/remove with revert + error message on
  failure, `try/catch/finally` from day one (the statuses offline lesson).
- **`NotesSection`** — newest-first list (`authorName`, relative date, body),
  a textarea + Add button, delete button rendered only when
  `canDeleteNote`-equivalent client check passes (server still enforces).

Panel integration (`HousePanel`, `BusinessPanel` detail views):
- Tags section directly below the Status chips.
- Notes section between the actions and Visit History.
- Panel data fetch extended to load tags + notes alongside existing calls.
- Both panels need the current user's id and role for the delete-button
  visibility check. The map server page (`app/(app)/map/page.tsx`) already
  holds the session and passes `userRole` into `MapShell` — widen that to
  `currentUser: { id: string; role: string }` passed from the page through
  `MapShell` to both panels. (`HousePanel`'s existing `userRole` prop is
  subsumed; migrate its uses rather than carrying both props. No API change —
  `/api/users/me` stays lastLat/lastLng-only.)

Admin: `/admin/tags` page — table of tags with usage count
(`COUNT(house_tags) + COUNT(business_tags)`), inline rename, delete with
confirm. Admin-gated like `/admin/statuses`. Nav entry
`{ href: '/admin/tags', label: 'Tags', roles: ['admin'] }`.

## Error handling

- Optimistic UI reverts on failure; panel error banner reused.
- Empty tag names and note bodies rejected server-side (400).
- Tag rename collisions → 409 with a clear message the admin page surfaces.
- All new mutations tolerate thrown fetches (offline) without stuck state.

## Testing

- Schema tests: new tables/columns present with correct DB column names.
- `lib/permissions.test.ts`: `canDeleteNote` matrix (author yes, other rep
  no, manager yes, admin yes, null-author note → manager+ only).
- Component tests: `TagEditor` (renders chips, remove calls DELETE, typeahead
  suggests, Enter attaches new), `NotesSection` (renders stream, add posts,
  delete visibility by role/author).
- Tag name normalization: "Dog" then "dog" yields one tag (unit-test the
  normalization helper; the DB unique index is the backstop).

## Out of scope

- Map filtering by tag (future issue, pairs with status filtering).
- Tag colors, note editing, per-team tag vocabularies.
- Search integration (tags/notes as search targets — belongs with issue #17).
