# Tags & Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Team-shared tags and author-attributed note streams on houses and businesses, editable from the map panels, with a shared tag vocabulary reps grow from the field and admins curate.

**Architecture:** One shared `tags` vocabulary table plus per-entity join tables (`house_tags`, `business_tags`) and note tables (`house_notes`, `business_notes`) — matching the repo's per-entity precedent (`visits` / `business_visits`). Flat query-param API routes. Two shared client components (`TagEditor`, `NotesSection`) backed by two small hooks (`useTags`, `useNotes`) so both panels reuse identical fetch/optimistic logic.

**Tech Stack:** Next.js 15 App Router (edge runtime) on Cloudflare Pages, Neon Postgres, Drizzle ORM (hand-written SQL migrations), NextAuth v5, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-06-tags-notes-design.md`

## Global Constraints

- Every API route file starts with `export const runtime = 'edge'`.
- Code style: no semicolons, single quotes, 2-space indent.
- Migrations are hand-written SQL in `lib/db/migrations/` plus a manual journal entry. **The new entry's `when` MUST exceed 0009's `1782950400000`** — use `1783379478257` (authoring-time epoch). See issue #14 for why this matters.
- `@/` path alias for imports.
- Run tests with `npm run test:run` (all) or `npm run test:run -- <file>`.
- Do NOT run `npm run lint` — broken on main (issue #15), unrelated to this work.
- Known env fact: the single `lib/auth.test.ts` failure is env-only (missing AUTH_* vars; fails on main too) — expected, not yours.
- Commit after every task; reference `#3` in commit subjects.
- `npm run db:migrate` from this worktree needs `.env.local`: `cp /home/ubuntu/repos/door2door/.env.local .env.local` (gitignored; worktree does not have it). Applying to prod is fine — all statements are additive `IF NOT EXISTS`.
- Node binaries: the worktree has no `node_modules`; when a script needs a binary directly, use the main repo's (e.g. `node --env-file=.env.local /home/ubuntu/repos/door2door/node_modules/.bin/drizzle-kit migrate`). `npm run test:run` / `npx tsc` resolve fine from the worktree.

---

### Task 1: Schema — five tables, migration 0010, journal entry

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/schema.test.ts`
- Create: `lib/db/migrations/0010_tags_notes.sql`
- Modify: `lib/db/migrations/meta/_journal.json`

**Interfaces:**
- Produces: Drizzle tables `tags`, `houseTags`, `businessTags`, `houseNotes`, `businessNotes` and types `Tag`, `HouseNote`, `BusinessNote` exported from `@/lib/db/schema`. Later tasks import these.

- [ ] **Step 1: Write the failing tests**

Add `tags, houseTags, businessTags, houseNotes, businessNotes` to the import from `./schema` in `lib/db/schema.test.ts`, and append inside the `describe('schema', ...)` block:

```ts
  it('tags table has required columns', () => {
    expect(tags.id).toBeDefined()
    expect(tags.name).toBeDefined()
    expect((tags.createdAt as { name: string }).name).toBe('created_at')
  })

  it('tag join tables have required columns', () => {
    expect((houseTags.houseId as { name: string }).name).toBe('house_id')
    expect((houseTags.tagId as { name: string }).name).toBe('tag_id')
    expect((houseTags.userId as { name: string }).name).toBe('user_id')
    expect((businessTags.businessId as { name: string }).name).toBe('business_id')
    expect((businessTags.tagId as { name: string }).name).toBe('tag_id')
  })

  it('note tables have required columns', () => {
    expect((houseNotes.houseId as { name: string }).name).toBe('house_id')
    expect(houseNotes.body).toBeDefined()
    expect((houseNotes.userId as { name: string }).name).toBe('user_id')
    expect((businessNotes.businessId as { name: string }).name).toBe('business_id')
    expect(businessNotes.body).toBeDefined()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- lib/db/schema.test.ts`
Expected: FAIL — `tags` not exported from `./schema`.

- [ ] **Step 3: Add tables to `lib/db/schema.ts`**

Insert after the `businesses` table definition (all five reference tables defined above them):

```ts
export const tags = pgTable('tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(), // display casing preserved; uniqueness on lower(name) enforced by migration index
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const houseTags = pgTable('house_tags', {
  houseId: uuid('house_id').notNull().references(() => houses.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.houseId, table.tagId] }),
}))

export const businessTags = pgTable('business_tags', {
  businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.businessId, table.tagId] }),
}))

export const houseNotes = pgTable('house_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  houseId: uuid('house_id').notNull().references(() => houses.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const businessNotes = pgTable('business_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

Add to the type exports at the bottom:

```ts
export type Tag = typeof tags.$inferSelect
export type HouseNote = typeof houseNotes.$inferSelect
export type BusinessNote = typeof businessNotes.$inferSelect
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- lib/db/schema.test.ts`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Write the migration**

Create `lib/db/migrations/0010_tags_notes.sql`:

```sql
CREATE TABLE IF NOT EXISTS "tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "tags_name_lower_idx" ON "tags" (lower("name"));

CREATE TABLE IF NOT EXISTS "house_tags" (
  "house_id" uuid NOT NULL REFERENCES "houses"("id") ON DELETE CASCADE,
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("house_id", "tag_id")
);

CREATE INDEX IF NOT EXISTS "house_tags_tag_idx" ON "house_tags" ("tag_id");

CREATE TABLE IF NOT EXISTS "business_tags" (
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("business_id", "tag_id")
);

CREATE INDEX IF NOT EXISTS "business_tags_tag_idx" ON "business_tags" ("tag_id");

CREATE TABLE IF NOT EXISTS "house_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "house_id" uuid NOT NULL REFERENCES "houses"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "body" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "house_notes_house_idx" ON "house_notes" ("house_id");

CREATE TABLE IF NOT EXISTS "business_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "body" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "business_notes_business_idx" ON "business_notes" ("business_id");
```

- [ ] **Step 6: Register the migration in the journal**

Append to `entries` in `lib/db/migrations/meta/_journal.json` (after the idx 9 entry):

```json
    {
      "idx": 10,
      "version": "7",
      "when": 1783379478257,
      "tag": "0010_tags_notes",
      "breakpoints": true
    }
```

- [ ] **Step 7: Apply the migration (if `.env.local` is available)**

Run: `cp /home/ubuntu/repos/door2door/.env.local .env.local 2>/dev/null; node --env-file=.env.local /home/ubuntu/repos/door2door/node_modules/.bin/drizzle-kit migrate`
Expected: "migrations applied successfully". If `.env.local` doesn't exist at the source path, skip and note as a concern.

- [ ] **Step 8: Commit**

```bash
git add lib/db/schema.ts lib/db/schema.test.ts lib/db/migrations/0010_tags_notes.sql lib/db/migrations/meta/_journal.json
git commit -m "feat: tags, tag joins, and note tables with migration (#3)"
```

---

### Task 2: `lib/tags.ts` (name normalization) and `canDeleteNote` permission

**Files:**
- Create: `lib/tags.ts`
- Create: `lib/tags.test.ts`
- Modify: `lib/permissions.ts`
- Modify: `lib/permissions.test.ts`

**Interfaces:**
- Produces: `normalizeTagName(s: string): string` from `@/lib/tags` (client-safe — this file must never import `db`); `canDeleteNote(user: { id: string; role: string | null | undefined }, note: { userId: string | null }): boolean` from `@/lib/permissions`.

- [ ] **Step 1: Write the failing tests**

Create `lib/tags.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeTagName } from './tags'

describe('normalizeTagName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeTagName('  dog in yard  ')).toBe('dog in yard')
  })

  it('collapses internal whitespace', () => {
    expect(normalizeTagName('dog   in\tyard')).toBe('dog in yard')
  })

  it('returns empty string for blank input', () => {
    expect(normalizeTagName('   ')).toBe('')
    expect(normalizeTagName('')).toBe('')
  })

  it('preserves casing', () => {
    expect(normalizeTagName('Roof Damage')).toBe('Roof Damage')
  })
})
```

Append to the `describe('permissions', ...)` block in `lib/permissions.test.ts` (add `canDeleteNote` to the import from `./permissions`):

```ts
  it('note author can delete their own note', () => {
    expect(canDeleteNote({ id: 'u1', role: 'rep' }, { userId: 'u1' })).toBe(true)
  })

  it('another rep cannot delete someone else\'s note', () => {
    expect(canDeleteNote({ id: 'u2', role: 'rep' }, { userId: 'u1' })).toBe(false)
  })

  it('manager and admin can delete any note', () => {
    expect(canDeleteNote({ id: 'u2', role: 'manager' }, { userId: 'u1' })).toBe(true)
    expect(canDeleteNote({ id: 'u2', role: 'admin' }, { userId: 'u1' })).toBe(true)
  })

  it('orphaned note (null author) is manager+ only', () => {
    expect(canDeleteNote({ id: 'u1', role: 'rep' }, { userId: null })).toBe(false)
    expect(canDeleteNote({ id: 'u1', role: 'manager' }, { userId: null })).toBe(true)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- lib/tags.test.ts lib/permissions.test.ts`
Expected: FAIL — cannot resolve `./tags`; `canDeleteNote` not exported.

- [ ] **Step 3: Implement**

Create `lib/tags.ts`:

```ts
// Client-safe tag helpers — this module must never import server-only code (db, auth)

/** Trim and collapse internal whitespace. Casing is preserved; case-insensitive
 * uniqueness is enforced by the DB index on lower(name). */
export function normalizeTagName(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}
```

Append to `lib/permissions.ts`:

```ts
export function canDeleteNote(
  user: { id: string; role: string | null | undefined },
  note: { userId: string | null }
): boolean {
  if (user.role === 'admin' || user.role === 'manager') return true
  return note.userId !== null && note.userId === user.id
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- lib/tags.test.ts lib/permissions.test.ts`
Expected: PASS (8 new tests + pre-existing).

- [ ] **Step 5: Commit**

```bash
git add lib/tags.ts lib/tags.test.ts lib/permissions.ts lib/permissions.test.ts
git commit -m "feat: tag name normalization and note deletion permission (#3)"
```

---

### Task 3: Tag vocabulary API — `/api/tags` and `/api/tags/[id]`

**Files:**
- Create: `lib/tags-server.ts`
- Create: `app/api/tags/route.ts`
- Create: `app/api/tags/[id]/route.ts`

**Interfaces:**
- Consumes: `tags` table (Task 1), `normalizeTagName` (Task 2).
- Produces: `getOrCreateTag(rawName: string): Promise<{ id: string; name: string; created: boolean } | null>` from `@/lib/tags-server` (Task 4 uses it). Routes: `GET /api/tags?q=` → `[{ id, name }]` (limit 10); `GET /api/tags` → `[{ id, name, createdAt, usageCount }]`; `POST /api/tags {name}` → 201 created / 200 existing; `PATCH /api/tags/[id] {name}` (admin, 409 on collision); `DELETE /api/tags/[id]` (admin, 204).

No route-level test harness exists (issue #16); verification is `npx tsc --noEmit` — `getOrCreateTag`'s normalization input is covered by Task 2's tests.

- [ ] **Step 1: Create `lib/tags-server.ts`**

```ts
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { normalizeTagName } from './tags'

type TagHit = { id: string; name: string }

/** Find a tag case-insensitively or create it. Handles the unique-index race:
 * if a concurrent request creates the same tag between our SELECT and INSERT,
 * the INSERT fails and we re-select. Returns null for blank names. */
export async function getOrCreateTag(rawName: string): Promise<(TagHit & { created: boolean }) | null> {
  const name = normalizeTagName(rawName)
  if (!name) return null
  const existing = await db.execute(sql`SELECT id, name FROM tags WHERE lower(name) = lower(${name}) LIMIT 1`)
  if (existing.rows[0]) return { ...(existing.rows[0] as TagHit), created: false }
  try {
    const inserted = await db.execute(sql`INSERT INTO tags (name) VALUES (${name}) RETURNING id, name`)
    return { ...(inserted.rows[0] as TagHit), created: true }
  } catch {
    const raced = await db.execute(sql`SELECT id, name FROM tags WHERE lower(name) = lower(${name}) LIMIT 1`)
    return raced.rows[0] ? { ...(raced.rows[0] as TagHit), created: false } : null
  }
}
```

- [ ] **Step 2: Create `app/api/tags/route.ts`**

```ts
export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { getOrCreateTag } from '@/lib/tags-server'
import { sql } from 'drizzle-orm'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const q = new URL(req.url).searchParams.get('q')?.trim()

  if (q) {
    const rows = await db.execute(
      sql`SELECT id, name FROM tags WHERE name ILIKE ${'%' + q + '%'} ORDER BY name LIMIT 10`
    )
    return NextResponse.json(rows.rows)
  }

  // Full list with usage counts — used by the admin page
  const rows = await db.execute(sql`
    SELECT t.id, t.name, t.created_at AS "createdAt",
      (SELECT COUNT(*) FROM house_tags ht WHERE ht.tag_id = t.id) +
      (SELECT COUNT(*) FROM business_tags bt WHERE bt.tag_id = t.id) AS "usageCount"
    FROM tags t ORDER BY t.name`)
  return NextResponse.json(rows.rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const body = await req.json()
  const tag = await getOrCreateTag(body.name ?? '')
  if (!tag) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const { created, ...row } = tag
  return NextResponse.json(row, { status: created ? 201 : 200 })
})
```

- [ ] **Step 3: Create `app/api/tags/[id]/route.ts`**

```ts
export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tags } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { normalizeTagName } from '@/lib/tags'
import { eq, sql } from 'drizzle-orm'

export const PATCH = withErrorHandling(async (req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const { id } = await params
  const body = await req.json()

  const name = normalizeTagName(body.name ?? '')
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const [existing] = await db.select().from(tags).where(eq(tags.id, id))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const collision = await db.execute(
    sql`SELECT id FROM tags WHERE lower(name) = lower(${name}) AND id != ${id} LIMIT 1`
  )
  if (collision.rows[0]) {
    return NextResponse.json({ error: 'A tag with that name already exists' }, { status: 409 })
  }

  const [tag] = await db.update(tags).set({ name }).where(eq(tags.id, id)).returning()
  return NextResponse.json(tag)
})

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin')
  const { id } = await params

  const [existing] = await db.select().from(tags).where(eq(tags.id, id))
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Join rows cascade via FK
  await db.delete(tags).where(eq(tags.id, id))
  return new NextResponse(null, { status: 204 })
})
```

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add lib/tags-server.ts app/api/tags
git commit -m "feat: tag vocabulary API with create-or-find and admin curation (#3)"
```

---

### Task 4: Attachment API — `/api/house-tags` and `/api/business-tags`

**Files:**
- Create: `app/api/house-tags/route.ts`
- Create: `app/api/business-tags/route.ts`

**Interfaces:**
- Consumes: `houseTags`, `businessTags` tables (Task 1); `getOrCreateTag` (Task 3).
- Produces: `GET /api/house-tags?houseId=` → `[{ tagId, name }]` ordered by name; `POST /api/house-tags {houseId, name}` → 201 `{ tagId, name }` (create-or-find + attach, idempotent); `DELETE /api/house-tags?houseId=&tagId=` → 204. Business mirror uses `businessId`.

- [ ] **Step 1: Create `app/api/house-tags/route.ts`**

```ts
export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { houseTags } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { getOrCreateTag } from '@/lib/tags-server'
import { and, eq, sql } from 'drizzle-orm'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const houseId = new URL(req.url).searchParams.get('houseId')
  if (!houseId) return NextResponse.json({ error: 'houseId required' }, { status: 400 })

  const rows = await db.execute(sql`
    SELECT ht.tag_id AS "tagId", t.name
    FROM house_tags ht JOIN tags t ON t.id = ht.tag_id
    WHERE ht.house_id = ${houseId} ORDER BY t.name`)
  return NextResponse.json(rows.rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const body = await req.json()
  if (!body.houseId) return NextResponse.json({ error: 'houseId required' }, { status: 400 })

  const tag = await getOrCreateTag(body.name ?? '')
  if (!tag) return NextResponse.json({ error: 'name required' }, { status: 400 })

  await db.insert(houseTags)
    .values({ houseId: body.houseId, tagId: tag.id, userId: session!.user!.id })
    .onConflictDoNothing()
  return NextResponse.json({ tagId: tag.id, name: tag.name }, { status: 201 })
})

export const DELETE = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { searchParams } = new URL(req.url)
  const houseId = searchParams.get('houseId')
  const tagId = searchParams.get('tagId')
  if (!houseId || !tagId) {
    return NextResponse.json({ error: 'houseId and tagId required' }, { status: 400 })
  }

  await db.delete(houseTags).where(and(eq(houseTags.houseId, houseId), eq(houseTags.tagId, tagId)))
  return new NextResponse(null, { status: 204 })
})
```

- [ ] **Step 2: Create `app/api/business-tags/route.ts`**

Same shape with the business table and key (full file, not a diff):

```ts
export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { businessTags } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { getOrCreateTag } from '@/lib/tags-server'
import { and, eq, sql } from 'drizzle-orm'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const businessId = new URL(req.url).searchParams.get('businessId')
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 })

  const rows = await db.execute(sql`
    SELECT bt.tag_id AS "tagId", t.name
    FROM business_tags bt JOIN tags t ON t.id = bt.tag_id
    WHERE bt.business_id = ${businessId} ORDER BY t.name`)
  return NextResponse.json(rows.rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const body = await req.json()
  if (!body.businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 })

  const tag = await getOrCreateTag(body.name ?? '')
  if (!tag) return NextResponse.json({ error: 'name required' }, { status: 400 })

  await db.insert(businessTags)
    .values({ businessId: body.businessId, tagId: tag.id, userId: session!.user!.id })
    .onConflictDoNothing()
  return NextResponse.json({ tagId: tag.id, name: tag.name }, { status: 201 })
})

export const DELETE = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { searchParams } = new URL(req.url)
  const businessId = searchParams.get('businessId')
  const tagId = searchParams.get('tagId')
  if (!businessId || !tagId) {
    return NextResponse.json({ error: 'businessId and tagId required' }, { status: 400 })
  }

  await db.delete(businessTags).where(and(eq(businessTags.businessId, businessId), eq(businessTags.tagId, tagId)))
  return new NextResponse(null, { status: 204 })
})
```

- [ ] **Step 3: Verify compile + full suite**

Run: `npx tsc --noEmit && npm run test:run`
Expected: PASS (with the known env-only auth failure).

- [ ] **Step 4: Commit**

```bash
git add app/api/house-tags app/api/business-tags
git commit -m "feat: tag attach/detach API for houses and businesses (#3)"
```

---

### Task 5: Notes API — `/api/house-notes` (+`/[id]`) and `/api/business-notes` (+`/[id]`)

**Files:**
- Create: `app/api/house-notes/route.ts`
- Create: `app/api/house-notes/[id]/route.ts`
- Create: `app/api/business-notes/route.ts`
- Create: `app/api/business-notes/[id]/route.ts`

**Interfaces:**
- Consumes: `houseNotes`, `businessNotes` tables (Task 1); `canDeleteNote` (Task 2).
- Produces: `GET /api/house-notes?houseId=` → newest-first `[{ id, body, userId, createdAt, authorName }]`; `POST {houseId, body}` → 201 (same row shape); `DELETE /api/house-notes/[id]` → 204 (author or manager+, else 403). Business mirror with `businessId`.

- [ ] **Step 1: Create `app/api/house-notes/route.ts`**

```ts
export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { houseNotes } from '@/lib/db/schema'
import { requireRole } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { sql } from 'drizzle-orm'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const houseId = new URL(req.url).searchParams.get('houseId')
  if (!houseId) return NextResponse.json({ error: 'houseId required' }, { status: 400 })

  const rows = await db.execute(sql`
    SELECT n.id, n.body, n.user_id AS "userId", n.created_at AS "createdAt",
      COALESCE(u.name, 'Unknown') AS "authorName"
    FROM house_notes n LEFT JOIN users u ON u.id = n.user_id
    WHERE n.house_id = ${houseId} ORDER BY n.created_at DESC`)
  return NextResponse.json(rows.rows)
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const body = await req.json()
  if (!body.houseId) return NextResponse.json({ error: 'houseId required' }, { status: 400 })
  const text = (body.body ?? '').trim()
  if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const [note] = await db.insert(houseNotes).values({
    houseId: body.houseId,
    userId: session!.user!.id,
    body: text,
  }).returning()
  return NextResponse.json(
    { ...note, authorName: session!.user!.name ?? 'Unknown' },
    { status: 201 }
  )
})
```

- [ ] **Step 2: Create `app/api/house-notes/[id]/route.ts`**

```ts
export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { houseNotes } from '@/lib/db/schema'
import { requireRole, canDeleteNote } from '@/lib/permissions'
import { withErrorHandling } from '@/lib/api'
import { eq } from 'drizzle-orm'

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }) => {
  const session = await auth()
  requireRole(session?.user?.role, 'admin', 'manager', 'rep')
  const { id } = await params

  const [note] = await db.select().from(houseNotes).where(eq(houseNotes.id, id))
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canDeleteNote({ id: session!.user!.id!, role: session!.user!.role }, note)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.delete(houseNotes).where(eq(houseNotes.id, id))
  return new NextResponse(null, { status: 204 })
})
```

- [ ] **Step 3: Create the business mirrors**

`app/api/business-notes/route.ts` — identical to Step 1 with these substitutions: import `businessNotes` instead of `houseNotes`; query param and body field `businessId` (error text `'businessId required'`); SQL `FROM business_notes n` and `WHERE n.business_id = ${businessId}`; insert `.values({ businessId: body.businessId, userId: session!.user!.id, body: text })`.

`app/api/business-notes/[id]/route.ts` — identical to Step 2 with `businessNotes` in place of `houseNotes` (import, select, delete).

- [ ] **Step 4: Verify compile + full suite**

Run: `npx tsc --noEmit && npm run test:run`
Expected: PASS (known env-only auth failure aside).

- [ ] **Step 5: Commit**

```bash
git add app/api/house-notes app/api/business-notes
git commit -m "feat: house and business note streams API with author-or-manager delete (#3)"
```

---

### Task 6: `useTags` hook + `TagEditor` component (TDD)

**Files:**
- Create: `components/map/useTags.ts`
- Create: `components/map/TagEditor.tsx`
- Create: `components/map/TagEditor.test.tsx`

**Interfaces:**
- Consumes: `/api/house-tags` / `/api/business-tags` (Task 4), `/api/tags?q=` (Task 3).
- Produces:
  - `useTags(endpoint: 'house-tags' | 'business-tags', entityKey: 'houseId' | 'businessId', entityId: string | null)` → `{ tags: TagRef[]; attach: (name: string) => void; remove: (tagId: string) => void; error: string | null }`; `type TagRef = { tagId: string; name: string }` — both exported from `@/components/map/useTags`.
  - `TagEditor` props: `{ tags: TagRef[]; onAttach: (name: string) => void; onRemove: (tagId: string) => void }`.

- [ ] **Step 1: Write the failing component test**

Create `components/map/TagEditor.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TagEditor } from './TagEditor'

const TAGS = [
  { tagId: 't1', name: 'dog in yard' },
  { tagId: 't2', name: 'roof damage' },
]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ id: 't3', name: 'dog friendly' }, { id: 't1', name: 'dog in yard' }],
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TagEditor', () => {
  it('renders attached tags as chips', () => {
    render(<TagEditor tags={TAGS} onAttach={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('dog in yard')).toBeInTheDocument()
    expect(screen.getByText('roof damage')).toBeInTheDocument()
  })

  it('remove button calls onRemove with the tagId', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<TagEditor tags={TAGS} onAttach={vi.fn()} onRemove={onRemove} />)
    await user.click(screen.getByRole('button', { name: 'Remove roof damage' }))
    expect(onRemove).toHaveBeenCalledWith('t2')
  })

  it('typing shows suggestions, excluding already-attached tags', async () => {
    const user = userEvent.setup()
    render(<TagEditor tags={TAGS} onAttach={vi.fn()} onRemove={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Add tag' }))
    await user.type(screen.getByRole('textbox', { name: 'New tag' }), 'dog')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'dog friendly' })).toBeInTheDocument()
    })
    // t1 "dog in yard" is already attached — must not be suggested
    expect(screen.queryByRole('button', { name: 'dog in yard' })).not.toBeInTheDocument()
  })

  it('clicking a suggestion attaches it and clears the input', async () => {
    const user = userEvent.setup()
    const onAttach = vi.fn()
    render(<TagEditor tags={TAGS} onAttach={onAttach} onRemove={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Add tag' }))
    await user.type(screen.getByRole('textbox', { name: 'New tag' }), 'dog')
    await waitFor(() => screen.getByRole('button', { name: 'dog friendly' }))
    await user.click(screen.getByRole('button', { name: 'dog friendly' }))
    expect(onAttach).toHaveBeenCalledWith('dog friendly')
    expect(screen.getByRole('textbox', { name: 'New tag' })).toHaveValue('')
  })

  it('Enter attaches the typed name', async () => {
    const user = userEvent.setup()
    const onAttach = vi.fn()
    render(<TagEditor tags={TAGS} onAttach={onAttach} onRemove={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Add tag' }))
    await user.type(screen.getByRole('textbox', { name: 'New tag' }), 'solar panels{Enter}')
    expect(onAttach).toHaveBeenCalledWith('solar panels')
  })

  it('Enter with blank input does nothing', async () => {
    const user = userEvent.setup()
    const onAttach = vi.fn()
    render(<TagEditor tags={TAGS} onAttach={onAttach} onRemove={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Add tag' }))
    await user.type(screen.getByRole('textbox', { name: 'New tag' }), '   {Enter}')
    expect(onAttach).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- components/map/TagEditor.test.tsx`
Expected: FAIL — cannot resolve `./TagEditor`.

- [ ] **Step 3: Implement `components/map/useTags.ts`**

```ts
'use client'
import { useState, useEffect, useCallback } from 'react'

export type TagRef = { tagId: string; name: string }

/** Fetches and mutates the tags attached to one house or business.
 * Attach is optimistic (temp chip swapped for the server row);
 * remove is optimistic with revert. All failures set `error`. */
export function useTags(
  endpoint: 'house-tags' | 'business-tags',
  entityKey: 'houseId' | 'businessId',
  entityId: string | null,
) {
  const [tags, setTags] = useState<TagRef[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setTags([])
    setError(null)
    if (!entityId) return
    fetch(`/api/${endpoint}?${entityKey}=${entityId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setTags)
      .catch(() => {})
  }, [endpoint, entityKey, entityId])

  const attach = useCallback(async (name: string) => {
    if (!entityId) return
    const trimmed = name.trim()
    if (!trimmed) return
    if (tags.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) return
    const tempId = `pending:${trimmed}`
    setError(null)
    setTags(prev => [...prev, { tagId: tempId, name: trimmed }])
    try {
      const res = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [entityKey]: entityId, name: trimmed }),
      })
      if (!res.ok) throw new Error('attach failed')
      const saved: TagRef = await res.json()
      setTags(prev => prev.map(t => t.tagId === tempId ? saved : t))
    } catch {
      setTags(prev => prev.filter(t => t.tagId !== tempId))
      setError('Failed to add tag. Please try again.')
    }
  }, [endpoint, entityKey, entityId, tags])

  const remove = useCallback(async (tagId: string) => {
    if (!entityId || tagId.startsWith('pending:')) return
    const removed = tags.find(t => t.tagId === tagId)
    if (!removed) return
    setError(null)
    setTags(prev => prev.filter(t => t.tagId !== tagId))
    try {
      const res = await fetch(`/api/${endpoint}?${entityKey}=${entityId}&tagId=${tagId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('remove failed')
    } catch {
      setTags(prev => [...prev, removed])
      setError('Failed to remove tag. Please try again.')
    }
  }, [endpoint, entityKey, entityId, tags])

  return { tags, attach, remove, error }
}
```

- [ ] **Step 4: Implement `components/map/TagEditor.tsx`**

```tsx
'use client'
import { useState, useRef } from 'react'
import { XIcon, PlusIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { TagRef } from './useTags'

type Suggestion = { id: string; name: string }

type Props = {
  tags: TagRef[]
  onAttach: (name: string) => void
  onRemove: (tagId: string) => void
}

export function TagEditor({ tags, onAttach, onRemove }: Props) {
  const [adding, setAdding] = useState(false)
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  function handleInputChange(value: string) {
    setInput(value)
    clearTimeout(debounceRef.current)
    if (!value.trim()) { setSuggestions([]); return }
    debounceRef.current = setTimeout(() => {
      fetch(`/api/tags?q=${encodeURIComponent(value.trim())}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then((rows: Suggestion[]) =>
          setSuggestions(rows.filter(s => !tags.some(t => t.tagId === s.id))))
        .catch(() => {})
    }, 250)
  }

  function submit(name: string) {
    if (!name.trim()) return
    onAttach(name.trim())
    setInput('')
    setSuggestions([])
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map(t => (
          <span key={t.tagId} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium">
            {t.name}
            <button
              type="button"
              aria-label={`Remove ${t.name}`}
              onClick={() => onRemove(t.tagId)}
              className="text-muted-foreground hover:text-destructive"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        {!adding && (
          <button
            type="button"
            aria-label="Add tag"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <PlusIcon className="h-3 w-3" />
            Add tag
          </button>
        )}
      </div>
      {adding && (
        <div className="space-y-1.5">
          <Input
            aria-label="New tag"
            value={input}
            autoFocus
            placeholder="Type a tag…"
            onChange={e => handleInputChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); submit(input) }
              if (e.key === 'Escape') { setAdding(false); setInput(''); setSuggestions([]) }
            }}
          />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => submit(s.name)}
                  className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:run -- components/map/TagEditor.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add components/map/useTags.ts components/map/TagEditor.tsx components/map/TagEditor.test.tsx
git commit -m "feat: useTags hook and TagEditor with typeahead (#3)"
```

---

### Task 7: `useNotes` hook + `NotesSection` component (TDD)

**Files:**
- Create: `components/map/useNotes.ts`
- Create: `components/map/NotesSection.tsx`
- Create: `components/map/NotesSection.test.tsx`

**Interfaces:**
- Consumes: `/api/house-notes` / `/api/business-notes` (Task 5); `canDeleteNote` (Task 2).
- Produces:
  - `useNotes(endpoint: 'house-notes' | 'business-notes', entityKey: 'houseId' | 'businessId', entityId: string | null)` → `{ notes: NoteRow[]; add: (body: string) => void; removeNote: (id: string) => void; error: string | null; busy: boolean }`; `type NoteRow = { id: string; body: string; userId: string | null; createdAt: string; authorName: string }` — exported from `@/components/map/useNotes`.
  - `NotesSection` props: `{ notes: NoteRow[]; currentUser: { id: string; role: string }; onAdd: (body: string) => void; onDelete: (id: string) => void; busy?: boolean }`.

- [ ] **Step 1: Write the failing component test**

Create `components/map/NotesSection.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { NotesSection } from './NotesSection'

const NOTES = [
  { id: 'n1', body: 'gate code 1234', userId: 'u1', createdAt: '2026-07-05T10:00:00Z', authorName: 'Brett' },
  { id: 'n2', body: 'big dog, friendly', userId: 'u2', createdAt: '2026-07-04T10:00:00Z', authorName: 'Alice' },
]

describe('NotesSection', () => {
  it('renders notes with author names', () => {
    render(<NotesSection notes={NOTES} currentUser={{ id: 'u1', role: 'rep' }} onAdd={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('gate code 1234')).toBeInTheDocument()
    expect(screen.getByText(/Brett/)).toBeInTheDocument()
    expect(screen.getByText(/Alice/)).toBeInTheDocument()
  })

  it('shows empty state when there are no notes', () => {
    render(<NotesSection notes={[]} currentUser={{ id: 'u1', role: 'rep' }} onAdd={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('No notes yet.')).toBeInTheDocument()
  })

  it('rep sees delete only on their own note', () => {
    render(<NotesSection notes={NOTES} currentUser={{ id: 'u1', role: 'rep' }} onAdd={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Delete note by Brett' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete note by Alice' })).not.toBeInTheDocument()
  })

  it('manager sees delete on every note', () => {
    render(<NotesSection notes={NOTES} currentUser={{ id: 'u9', role: 'manager' }} onAdd={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Delete note by Brett' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete note by Alice' })).toBeInTheDocument()
  })

  it('delete calls onDelete with the note id', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(<NotesSection notes={NOTES} currentUser={{ id: 'u1', role: 'rep' }} onAdd={vi.fn()} onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: 'Delete note by Brett' }))
    expect(onDelete).toHaveBeenCalledWith('n1')
  })

  it('adding a note submits trimmed body and clears the field', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<NotesSection notes={[]} currentUser={{ id: 'u1', role: 'rep' }} onAdd={onAdd} onDelete={vi.fn()} />)
    const box = screen.getByPlaceholderText('Add a note about this property…')
    await user.type(box, '  new gate code 9999  ')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledWith('new gate code 9999')
    expect(box).toHaveValue('')
  })

  it('Add is disabled for blank input and while busy', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <NotesSection notes={[]} currentUser={{ id: 'u1', role: 'rep' }} onAdd={vi.fn()} onDelete={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    await user.type(screen.getByPlaceholderText('Add a note about this property…'), 'hi')
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled()
    rerender(
      <NotesSection notes={[]} currentUser={{ id: 'u1', role: 'rep' }} onAdd={vi.fn()} onDelete={vi.fn()} busy />
    )
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- components/map/NotesSection.test.tsx`
Expected: FAIL — cannot resolve `./NotesSection`.

- [ ] **Step 3: Implement `components/map/useNotes.ts`**

```ts
'use client'
import { useState, useEffect, useCallback } from 'react'

export type NoteRow = {
  id: string
  body: string
  userId: string | null
  createdAt: string
  authorName: string
}

/** Fetches and mutates the note stream for one house or business.
 * Add awaits the server (needs the row id); delete is optimistic with revert. */
export function useNotes(
  endpoint: 'house-notes' | 'business-notes',
  entityKey: 'houseId' | 'businessId',
  entityId: string | null,
) {
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setNotes([])
    setError(null)
    if (!entityId) return
    fetch(`/api/${endpoint}?${entityKey}=${entityId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setNotes)
      .catch(() => {})
  }, [endpoint, entityKey, entityId])

  const add = useCallback(async (body: string) => {
    if (!entityId || !body.trim()) return
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [entityKey]: entityId, body: body.trim() }),
      })
      if (!res.ok) throw new Error('add failed')
      const note: NoteRow = await res.json()
      setNotes(prev => [note, ...prev])
    } catch {
      setError('Failed to add note. Please try again.')
    } finally {
      setBusy(false)
    }
  }, [endpoint, entityKey, entityId])

  const removeNote = useCallback(async (id: string) => {
    const removed = notes.find(n => n.id === id)
    if (!removed) return
    setError(null)
    setNotes(prev => prev.filter(n => n.id !== id))
    try {
      const res = await fetch(`/api/${endpoint}/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
    } catch {
      setNotes(prev => [removed, ...prev])
      setError('Failed to delete note. Please try again.')
    }
  }, [endpoint, notes])

  return { notes, add, removeNote, error, busy }
}
```

- [ ] **Step 4: Implement `components/map/NotesSection.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Trash2Icon } from 'lucide-react'
import { canDeleteNote } from '@/lib/permissions'
import type { NoteRow } from './useNotes'

type Props = {
  notes: NoteRow[]
  currentUser: { id: string; role: string }
  onAdd: (body: string) => void
  onDelete: (id: string) => void
  busy?: boolean
}

export function NotesSection({ notes, currentUser, onAdd, onDelete, busy }: Props) {
  const [draft, setDraft] = useState('')

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    onAdd(draft.trim())
    setDraft('')
  }

  return (
    <div className="space-y-2">
      <form onSubmit={handleAdd} className="flex items-start gap-2">
        <Textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={1}
          placeholder="Add a note about this property…"
          className="flex-1"
        />
        <Button type="submit" disabled={busy || !draft.trim()}>Add</Button>
      </form>
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map(n => (
            <li key={n.id} className="flex items-start gap-3 rounded-xl border bg-background px-4 py-3 text-sm">
              <div className="flex-1 space-y-0.5">
                <p>{n.body}</p>
                <p className="text-xs text-muted-foreground">
                  {n.authorName} · {new Date(n.createdAt).toLocaleDateString()}
                </p>
              </div>
              {canDeleteNote(currentUser, n) && (
                <button
                  type="button"
                  aria-label={`Delete note by ${n.authorName}`}
                  onClick={() => onDelete(n.id)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2Icon className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:run -- components/map/NotesSection.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add components/map/useNotes.ts components/map/NotesSection.tsx components/map/NotesSection.test.tsx
git commit -m "feat: useNotes hook and NotesSection with role-aware delete (#3)"
```

---

### Task 8: Thread `currentUser` and integrate tags + notes into `HousePanel`

**Files:**
- Modify: `app/(app)/map/page.tsx`
- Modify: `components/map/MapShell.tsx`
- Modify: `components/map/HousePanel.tsx`

**Interfaces:**
- Consumes: `useTags`/`TagEditor` (Task 6), `useNotes`/`NotesSection` (Task 7).
- Produces: `MapShell` prop is now `currentUser: { id: string; role: string }` (replaces `userRole: string`); `HousePanel` prop likewise. Task 9 relies on `MapShell` passing `currentUser` to `BusinessPanel`.

- [ ] **Step 1: Update `app/(app)/map/page.tsx`**

Replace the return statement:

```tsx
  return <MapShell currentUser={{ id: session.user.id, role: session.user.role }} />
```

- [ ] **Step 2: Update `components/map/MapShell.tsx`**

Change the props type and destructuring:

```tsx
type Props = {
  currentUser: { id: string; role: string }
}

export function MapShell({ currentUser }: Props) {
```

In the JSX, change the `HousePanel` invocation's `userRole={userRole}` to `currentUser={currentUser}` (leave every other prop as-is). Leave `BusinessPanel` unchanged in this task — Task 9 updates it.

- [ ] **Step 3: Update `components/map/HousePanel.tsx`**

1. Add imports:

```tsx
import { TagEditor } from './TagEditor'
import { NotesSection } from './NotesSection'
import { useTags } from './useTags'
import { useNotes } from './useNotes'
```

2. In `Props`, replace `userRole: string` with `currentUser: { id: string; role: string }`, and update the destructuring in the component signature to match.

3. Replace the two role checks in the Actions block: `userRole === 'rep'` → `currentUser.role === 'rep'` and `(userRole === 'admin' || userRole === 'manager')` → `(currentUser.role === 'admin' || currentUser.role === 'manager')`.

4. Add the hooks inside the component, after the `statusUpdating` state declaration:

```tsx
  const { tags, attach: attachTag, remove: removeTag, error: tagError } = useTags('house-tags', 'houseId', house?.id ?? null)
  const { notes, add: addNote, removeNote, error: noteError, busy: noteBusy } = useNotes('house-notes', 'houseId', house?.id ?? null)
```

5. In the `'detail'` view, insert a Tags section directly after the `{/* Status */}` block:

```tsx
              {/* Tags */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</p>
                {tagError && <p className="mb-2 text-sm text-destructive">{tagError}</p>}
                <TagEditor tags={tags} onAttach={attachTag} onRemove={removeTag} />
              </div>
```

6. Insert a Notes section directly after the `{/* Actions */}` block (before `{/* Visit history */}`):

```tsx
              {/* Notes */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
                {noteError && <p className="mb-2 text-sm text-destructive">{noteError}</p>}
                <NotesSection notes={notes} currentUser={currentUser} onAdd={addNote} onDelete={removeNote} busy={noteBusy} />
              </div>
```

- [ ] **Step 4: Verify — compile, full suite, no `userRole` stragglers**

Run: `npx tsc --noEmit && npm run test:run`
Expected: PASS (known env-only auth failure aside).

Run: `grep -rn "userRole" app components --include="*.tsx"`
Expected: no matches. If any remain (only Task 9's `BusinessPanel` should be untouched by this grep since it never had the prop), update them to `currentUser`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/map/page.tsx" components/map/MapShell.tsx components/map/HousePanel.tsx
git commit -m "feat: tags and notes in HousePanel, currentUser threading (#3)"
```

---

### Task 9: Integrate tags + notes into `BusinessPanel`

**Files:**
- Modify: `components/map/BusinessPanel.tsx`
- Modify: `components/map/MapShell.tsx`

**Interfaces:**
- Consumes: `currentUser` from `MapShell` (Task 8); hooks/components (Tasks 6–7).
- Produces: `BusinessPanel` props gain `currentUser: { id: string; role: string }`.

- [ ] **Step 1: Update `components/map/BusinessPanel.tsx`**

1. Add imports:

```tsx
import { TagEditor } from './TagEditor'
import { NotesSection } from './NotesSection'
import { useTags } from './useTags'
import { useNotes } from './useNotes'
```

2. Add `currentUser: { id: string; role: string }` to `Props` (after `statuses`), and to the component's destructuring.

3. Add hooks after the `statusUpdating` state declaration (note the alias — `notes` is taken by the visit-form state):

```tsx
  const { tags, attach: attachTag, remove: removeTag, error: tagError } = useTags('business-tags', 'businessId', business?.id ?? null)
  const { notes: bizNotes, add: addNote, removeNote, error: noteError, busy: noteBusy } = useNotes('business-notes', 'businessId', business?.id ?? null)
```

4. In the `'detail'` view, insert after the Status `<div>` (before the Log Visit button):

```tsx
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</p>
                {tagError && <p className="mb-2 text-sm text-destructive">{tagError}</p>}
                <TagEditor tags={tags} onAttach={attachTag} onRemove={removeTag} />
              </div>
```

5. Insert after the Log Visit `<Button>` (before the Recent Visits block):

```tsx
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
                {noteError && <p className="mb-2 text-sm text-destructive">{noteError}</p>}
                <NotesSection notes={bizNotes} currentUser={currentUser} onAdd={addNote} onDelete={removeNote} busy={noteBusy} />
              </div>
```

- [ ] **Step 2: Pass the prop from `components/map/MapShell.tsx`**

Add `currentUser={currentUser}` to the `<BusinessPanel ... />` invocation.

- [ ] **Step 3: Verify compile + full suite**

Run: `npx tsc --noEmit && npm run test:run`
Expected: PASS (known env-only auth failure aside).

- [ ] **Step 4: Commit**

```bash
git add components/map/BusinessPanel.tsx components/map/MapShell.tsx
git commit -m "feat: tags and notes in BusinessPanel (#3)"
```

---

### Task 10: Admin tags page and nav entry

**Files:**
- Create: `app/(app)/admin/tags/page.tsx`
- Create: `app/(app)/admin/tags/client.tsx`
- Modify: `app/(app)/nav-bar.tsx`

**Interfaces:**
- Consumes: `GET /api/tags` (usage counts), `PATCH/DELETE /api/tags/[id]` (Task 3).

- [ ] **Step 1: Create `app/(app)/admin/tags/page.tsx`**

```tsx
export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { TagsClient, type TagRow } from './client'

export default async function TagsPage() {
  const session = await auth()
  if (session?.user?.role !== 'admin') redirect('/map')

  const rows = await db.execute(sql`
    SELECT t.id, t.name, t.created_at AS "createdAt",
      (SELECT COUNT(*) FROM house_tags ht WHERE ht.tag_id = t.id) +
      (SELECT COUNT(*) FROM business_tags bt WHERE bt.tag_id = t.id) AS "usageCount"
    FROM tags t ORDER BY t.name`)

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-1">Tags</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Shared tag vocabulary. Reps create tags from the field; rename or delete
        them here to keep the vocabulary clean. Deleting a tag removes it from
        every house and business.
      </p>
      <TagsClient initialTags={rows.rows as TagRow[]} />
    </div>
  )
}
```

- [ ] **Step 2: Create `app/(app)/admin/tags/client.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Trash2Icon } from 'lucide-react'

export type TagRow = { id: string; name: string; createdAt: string; usageCount: string | number }

type Props = { initialTags: TagRow[] }

export function TagsClient({ initialTags }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initialTags)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function refresh() {
    const res = await fetch('/api/tags')
    if (res.ok) setItems(await res.json())
    else setError('Could not reload tags')
    router.refresh()
  }

  async function rename(id: string, name: string): Promise<boolean> {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/tags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? 'Rename failed')
        return false
      }
      await refresh()
      return true
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(t: TagRow) {
    const uses = Number(t.usageCount)
    if (!window.confirm(`Delete "${t.name}"? It is attached to ${uses} propert${uses === 1 ? 'y' : 'ies'}.`)) return
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/tags/${t.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? 'Delete failed')
        return
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tags yet — reps create them from the map panels.</p>
      ) : (
        <ul className="space-y-2">
          {items.map(t => (
            <li key={t.id} className="flex items-center gap-3 border rounded-xl p-3">
              <div className="flex-1 min-w-0">
                <EditableName name={t.name} onSave={name => rename(t.id, name)} />
              </div>
              <Badge variant="secondary">{Number(t.usageCount)} in use</Badge>
              <button
                disabled={busy}
                onClick={() => handleDelete(t)}
                aria-label={`Delete ${t.name}`}
                className="text-muted-foreground hover:text-destructive disabled:opacity-30"
              >
                <Trash2Icon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EditableName({ name: initial, onSave }: { name: string; onSave: (name: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(initial)

  if (!editing) {
    return (
      <button type="button" className="font-medium hover:underline" onClick={() => { setName(initial); setEditing(true) }}>
        {initial}
      </button>
    )
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async e => {
        e.preventDefault()
        if (!name.trim()) return
        const ok = await onSave(name.trim())
        if (ok) setEditing(false)
      }}
    >
      <Input value={name} onChange={e => setName(e.target.value)} className="h-8" autoFocus />
      <Button type="submit" size="sm">Save</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
    </form>
  )
}
```

- [ ] **Step 3: Add the nav entry**

In `app/(app)/nav-bar.tsx`, add to `ADMIN_ITEMS` after the Statuses row:

```ts
  { href: '/admin/tags',           label: 'Tags',          roles: ['admin'] },
```

- [ ] **Step 4: Verify compile + full suite**

Run: `npx tsc --noEmit && npm run test:run`
Expected: PASS (known env-only auth failure aside).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/admin/tags" "app/(app)/nav-bar.tsx"
git commit -m "feat: admin tags page with usage counts, rename, delete (#3)"
```

---

### Task 11: End-to-end verification

**Files:** none — verification and fixes only.

- [ ] **Step 1: Full gates**

Run: `npx tsc --noEmit && npm run test:run && AUTH_GOOGLE_ID=dummy AUTH_GOOGLE_SECRET=dummy AUTH_SECRET=dummy DATABASE_URL='postgresql://dummy:dummy@localhost:5432/dummy' npm run build`
Expected: tsc clean; tests pass (env-only auth failure aside); build succeeds with `/api/tags`, `/api/house-tags`, `/api/house-notes` (+ business mirrors, + `[id]` routes) and `/admin/tags` in the route list.

- [ ] **Step 2: Migration check**

Confirm Task 1 Step 7 applied migration 0010 (or record that it must be applied before merge — additive-only, safe to run ahead of deploy).

- [ ] **Step 3: Smoke test (controller decision)**

The browser-free smoke path from PR #13 (Neon branch + minted session + curl) applies here if wanted: attach/detach a tag, dedupe "Dog" vs "dog", note add/delete as author vs other-rep (403) vs manager (204), admin rename collision → 409. The controller/user decides whether to run it; the plan's gates above are the required minimum.

- [ ] **Step 4: Fix anything found, re-run gates, commit fixes**

```bash
git add -A
git commit -m "fix: post-verification fixes for tags and notes (#3)"
```

(Skip if nothing needed fixing.)

---

## Self-Review Notes

- **Spec coverage:** tables + unique lower(name) index + cascade/set-null semantics (Task 1); normalization + `canDeleteNote` (Task 2); vocabulary API incl. create-or-return, 409 rename collision, race handling (Task 3); one-round-trip attach + idempotent `onConflictDoNothing` (Task 4); notes API with `authorName` and author-or-manager delete (Task 5); typeahead editor with 250 ms debounce + optimistic attach/remove with revert (Task 6); notes UI with role-aware delete visibility (Task 7); `currentUser` threading exactly as the spec's map-page decision (Task 8); business parity (Task 9); admin page + nav (Task 10); gates (Task 11). Out-of-scope items (map filtering, colors, note editing, search integration) have no tasks — intentional.
- **Type consistency:** `TagRef { tagId, name }` used by hook, editor, and API response shape; `NoteRow` matches the notes GET/POST SQL aliases; `currentUser: { id: string; role: string }` identical across page → MapShell → panels → NotesSection; `canDeleteNote` client and server use the same signature.
- **Known naming hazard handled:** `notes` visit-form state in `BusinessPanel` vs the hook's list — aliased to `bizNotes` in Task 9.
