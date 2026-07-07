# Photos on Prospects (Cloudflare R2) — Design

**Issue:** #4 · **Date:** 2026-07-07 · **Status:** Approved (autonomous — user
offline, decisions delegated; review via PR)

In-app photo capture on houses and businesses, stored in Cloudflare R2,
displayed as a gallery in the map panels. **One user setup step before the
feature works in production: create the R2 bucket** (documented below and in
the PR).

## Decisions made autonomously (with rationale)

- **R2 via Pages binding, not S3-API keys.** The app deploys with
  `@cloudflare/next-on-pages`; `getRequestContext().env.PHOTOS` gives
  zero-credential access in production and `wrangler pages dev`. In plain
  `next dev` the binding doesn't exist — photo routes return 503 with a clear
  message rather than breaking the rest of the app. Rationale: no secrets to
  manage, no presigned-URL complexity, matches the platform.
- **Per-entity tables** (`house_photos`, `business_photos`) — reads are
  entity-scoped galleries, same access pattern as tags/notes, so the
  established precedent applies (unlike appointments).
- **Client-side downscale + JPEG re-encode before upload** (canvas, longest
  edge 1600px, quality 0.85). Rationale: field uploads over LTE must be small
  (~200-500KB not 8MB), and canvas re-encoding strips EXIF — including GPS —
  which is a privacy win for photos of private homes.
- **Auth-gated read-through serving** (`GET /api/house-photos/[id]` streams
  from R2 with `Cache-Control: private, max-age=31536000, immutable`). The
  bucket is never public; photos of homes are sensitive. Content is immutable
  per id so long private caching is safe.
- **Delete = author or manager/admin**, reusing `canDeleteNote` (it takes
  `(user, { userId })` — semantics identical; no new permission fn).
- **8 MB request cap** post-downscale (defense in depth; normal uploads are
  far smaller) → 413.

## User setup (one step, **BEFORE merging** — Cloudflare validates Pages bindings at deploy time, so a binding to a nonexistent bucket can hard-fail every deploy, not just this feature)

```
npx wrangler r2 bucket create door2door-photos
```

(or dashboard → R2 → Create bucket, name `door2door-photos`). The binding is
in `wrangler.toml` on this branch and ships with the next deploy.

## Data model

Migration `0012_photos` (journal `when` MUST exceed 0011's `1783412325067`;
use `1783435612577`).

`house_photos` / `business_photos` (identical shape):

| column | type | notes |
|---|---|---|
| `id` | uuid pk (client of route supplies via `crypto.randomUUID()` — used in the R2 key) |
| `houseId`/`businessId` | uuid FK, cascade | |
| `userId` | uuid FK → users, set null | uploader |
| `r2Key` | text not null | `house/<entityId>/<id>.jpg` / `business/...` |
| `createdAt` | timestamp | |

Index on the entity id column. R2 objects are NOT deleted by FK cascades —
row delete removes the object explicitly in the DELETE route; entity-cascade
orphans are accepted (rare, harmless, cleanable later).

## Storage access

`lib/photos-server.ts`: `getPhotosBucket(): R2Bucket | null` — wraps
`getRequestContext().env.PHOTOS` in try/catch (throws outside the Pages
runtime → null). All photo routes start with a null-check → 503
`{ error: 'Photo storage is not configured' }`.

`wrangler.toml` addition:

```toml
[[r2_buckets]]
binding = "PHOTOS"
bucket_name = "door2door-photos"
```

Types: a minimal structural `R2Bucket` type (put/get/delete, the only three
methods used) declared in `lib/photos-server.ts` — no new dependency;
`@cloudflare/workers-types` would add an install for three signatures.

## API (edge, `withErrorHandling`, all roles via `requireRole`)

Mirrored for business. House versions:

- `GET /api/house-photos?houseId=` → `[{ id, createdAt, userId, authorName }]`
  newest first (users LEFT JOIN, `COALESCE(u.name,'Unknown')`).
- `POST /api/house-photos?houseId=` — body: raw JPEG bytes
  (`Content-Type: image/jpeg` required → 415 otherwise; > 8 MB → 413;
  missing houseId → 400). Generates `id = crypto.randomUUID()`,
  `key = house/<houseId>/<id>.jpg`, `bucket.put(key, bytes, { httpMetadata:
  { contentType: 'image/jpeg' } })`, inserts row. 201 `{ id }`. If the DB
  insert fails after the put, best-effort `bucket.delete(key)` then rethrow.
- `GET /api/house-photos/[id]` → look up row, `bucket.get(r2Key)`, 404 if
  either missing; stream body with `Content-Type: image/jpeg` and the
  immutable private cache header.
- `DELETE /api/house-photos/[id]` → 404 unknown; 403 unless
  `canDeleteNote(sessionUser, row)`; `bucket.delete(r2Key)` then row delete;
  204.

## UI

`lib/photos.ts` (client-safe): `downscaleImage(file: File, maxEdge = 1600,
quality = 0.85): Promise<Blob>` (createImageBitmap → canvas → toBlob jpeg;
canvas is untestable in jsdom — covered by types + smoke, not unit tests) and
`photoUrl(entity: 'house' | 'business', id: string): string` (pure, tested).

`components/photos/PhotoSection.tsx` (shared, TDD): props
`{ entity: 'house' | 'business'; entityId: string | null; currentUser: { id: string; role: string } }`.
Self-contained (fetches its own list like the tags/notes hooks): thumbnail
grid (`<img loading="lazy">` via `photoUrl`), each thumb links to the
full-size URL in a new tab; an "Add photo" tile with
`<input type="file" accept="image/*" capture="environment">`; upload =
downscale → POST → prepend on success; delete button only when
`canDeleteNote` passes; optimistic delete with revert; AbortController on
entity switch; errors to a section banner. Busy state during upload
("Uploading…" on the tile).

Panels: Photos section after Notes in both `HousePanel` and `BusinessPanel`
(they already hold `currentUser`).

## Testing

- Unit: `photoUrl`; PhotoSection component tests with mocked fetch and a
  mocked `downscaleImage` (vi.mock the lib module) — renders thumbs, upload
  posts and prepends, delete visibility by role, optimistic revert, 503
  surfaced as banner.
- Schema tests per convention. Routes uninspectable (issue #16): thin over
  tested helpers; the R2 interaction verified by types + PR smoke once the
  bucket exists.

## Out of scope

- CompanyCam-style annotations, captions, photo-per-visit linking (column
  can be added later), bulk download, orphaned-object GC job.
