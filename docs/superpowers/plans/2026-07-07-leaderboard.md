# Team Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A ranked rep-performance table (doors / conversations / sales, week+month toggle) on all three dashboards, built entirely on existing data.

**Architecture:** One new SQL aggregate in `lib/stats.ts` (`getLeaderboard`, six `FILTER` counts over `visits UNION ALL business_visits`), one new client component (`Leaderboard` with a pure exported `rankRows` helper for testability), and section wiring in the dashboard server page. No schema changes, no migration, no new API routes.

**Tech Stack:** Next.js 15 App Router (edge runtime) on Cloudflare Pages, Neon Postgres via drizzle `sql` templates, React 19, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-07-leaderboard-design.md`

## Global Constraints

- Code style: no semicolons, single quotes, 2-space indent.
- Ranking is by doors knocked ONLY; tie-break sales desc, then name asc (null names last). Conversations/Sales are display columns, never sort keys.
- Count fields are strings (neon-http serializes `COUNT` as string) — same convention as the existing stats types; coerce with `Number()` at render/rank time, non-numeric → 0.
- Week default tab. Empty state text exactly: `No team members yet.`
- Run tests with `npm run test:run` (all) or `npm run test:run -- <file>`. Do NOT run `npm run lint` (broken on main, issue #15). The single `lib/auth.test.ts` failure is env-only (missing AUTH_* vars; fails on main too) — expected.
- Commit after every task; reference `#7` in commit subjects.
- The worktree has no `node_modules`; `npm run …`/`npx tsc` resolve fine from the worktree — just always run them from the worktree directory.

---

### Task 1: `getLeaderboard` query in `lib/stats.ts`

**Files:**
- Modify: `lib/stats.ts`

**Interfaces:**
- Produces (Task 2 and 3 depend on these exact names):

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

There is no DB test harness (issue #16); verification is `npx tsc --noEmit`. The SQL's correctness is exercised by the Task 3 build + smoke.

- [ ] **Step 1: Add the type and function to `lib/stats.ts`**

Append at the bottom of the file (it already imports `db` and `sql`):

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

// Ranked rep activity across house AND business visits. teamId null = all
// reps (admin cross-team view). Reps with zero visits still appear —
// COUNT(v.user_id) ignores the NULL rows a LEFT JOIN produces for them.
export async function getLeaderboard(teamId: string | null): Promise<LeaderboardRow[]> {
  const teamFilter = teamId ? sql`AND u.team_id = ${teamId}` : sql``
  const rows = await db.execute(sql`
    SELECT
      u.id, u.name,
      COUNT(v.user_id) FILTER (WHERE v.created_at >= date_trunc('week', CURRENT_DATE)) AS doors_week,
      COUNT(v.user_id) FILTER (WHERE v.contact_status = 'answered' AND v.created_at >= date_trunc('week', CURRENT_DATE)) AS conversations_week,
      COUNT(v.user_id) FILTER (WHERE v.sale_outcome = 'sold' AND v.created_at >= date_trunc('week', CURRENT_DATE)) AS sales_week,
      COUNT(v.user_id) FILTER (WHERE v.created_at >= date_trunc('month', CURRENT_DATE)) AS doors_month,
      COUNT(v.user_id) FILTER (WHERE v.contact_status = 'answered' AND v.created_at >= date_trunc('month', CURRENT_DATE)) AS conversations_month,
      COUNT(v.user_id) FILTER (WHERE v.sale_outcome = 'sold' AND v.created_at >= date_trunc('month', CURRENT_DATE)) AS sales_month
    FROM users u
    LEFT JOIN (
      SELECT user_id, contact_status, sale_outcome, created_at FROM visits
      UNION ALL
      SELECT user_id, contact_status, sale_outcome, created_at FROM business_visits
    ) v ON v.user_id = u.id
    WHERE u.role IS NOT NULL ${teamFilter}
    GROUP BY u.id, u.name
  `)
  return rows.rows as LeaderboardRow[]
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/stats.ts
git commit -m "feat: getLeaderboard stats query over house and business visits (#7)"
```

---

### Task 2: `Leaderboard` component + `rankRows` (TDD)

**Files:**
- Create: `components/dashboard/Leaderboard.tsx`
- Create: `components/dashboard/Leaderboard.test.tsx`

**Interfaces:**
- Consumes: `LeaderboardRow` from `@/lib/stats` (Task 1).
- Produces: `Leaderboard` component with props `{ rows: LeaderboardRow[]; currentUserId: string }`; exported helpers `rankRows(rows: LeaderboardRow[], period: LeaderboardWindow)` and `type LeaderboardWindow = 'week' | 'month'` (Task 3 imports only the component).

- [ ] **Step 1: Write the failing tests**

Create `components/dashboard/Leaderboard.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { Leaderboard, rankRows } from './Leaderboard'
import type { LeaderboardRow } from '@/lib/stats'

const row = (over: Partial<LeaderboardRow>): LeaderboardRow => ({
  id: 'x',
  name: 'X',
  doors_week: '0',
  conversations_week: '0',
  sales_week: '0',
  doors_month: '0',
  conversations_month: '0',
  sales_month: '0',
  ...over,
})

const ROWS: LeaderboardRow[] = [
  row({ id: 'u1', name: 'Alice', doors_week: '10', sales_week: '1', doors_month: '20' }),
  row({ id: 'u2', name: 'Bob', doors_week: '12', doors_month: '15' }),
  row({ id: 'u3', name: 'Cara', doors_week: '10', sales_week: '2', doors_month: '40' }),
]

function dataRowNames() {
  const [, ...dataRows] = screen.getAllByRole('row')
  return dataRows.map(r => within(r).getAllByRole('cell')[1].textContent)
}

describe('rankRows', () => {
  it('ranks by doors desc for the given window', () => {
    const ranked = rankRows(ROWS, 'week')
    expect(ranked.map(r => r.name)).toEqual(['Bob', 'Cara', 'Alice'])
    expect(ranked.map(r => r.rank)).toEqual([1, 2, 3])
  })

  it('tie-breaks by sales desc (Cara over Alice at 10 doors)', () => {
    const ranked = rankRows(ROWS, 'week')
    expect(ranked[1].name).toBe('Cara')
  })

  it('tie-breaks by name asc when doors and sales tie', () => {
    const ranked = rankRows([
      row({ id: 'a', name: 'Zed', doors_week: '5' }),
      row({ id: 'b', name: 'Amy', doors_week: '5' }),
    ], 'week')
    expect(ranked.map(r => r.name)).toEqual(['Amy', 'Zed'])
  })

  it('sorts null names last within a tie', () => {
    const ranked = rankRows([
      row({ id: 'a', name: null, doors_week: '5' }),
      row({ id: 'b', name: 'Amy', doors_week: '5' }),
    ], 'week')
    expect(ranked[0].name).toBe('Amy')
  })

  it('uses month values for the month window', () => {
    expect(rankRows(ROWS, 'month').map(r => r.name)).toEqual(['Cara', 'Alice', 'Bob'])
  })

  it('treats non-numeric counts as 0', () => {
    const ranked = rankRows([
      row({ id: 'a', name: 'A', doors_week: 'oops' }),
      row({ id: 'b', name: 'B', doors_week: '1' }),
    ], 'week')
    expect(ranked[0].name).toBe('B')
  })
})

describe('Leaderboard', () => {
  it('renders reps ranked by weekly doors with medals for the top three', () => {
    render(<Leaderboard rows={ROWS} currentUserId="u1" />)
    expect(dataRowNames()[0]).toContain('Bob')
    expect(screen.getByText('🥇')).toBeInTheDocument()
    expect(screen.getByText('🥈')).toBeInTheDocument()
    expect(screen.getByText('🥉')).toBeInTheDocument()
  })

  it('highlights the current user with a you badge', () => {
    render(<Leaderboard rows={ROWS} currentUserId="u3" />)
    expect(screen.getByText('you')).toBeInTheDocument()
    const caraRow = screen.getByText('you').closest('tr')!
    expect(within(caraRow).getByText('Cara')).toBeInTheDocument()
  })

  it('switching to month re-ranks the table', async () => {
    const user = userEvent.setup()
    render(<Leaderboard rows={ROWS} currentUserId="u1" />)
    await user.click(screen.getByRole('button', { name: 'This Month' }))
    expect(dataRowNames()[0]).toContain('Cara')
  })

  it('shows the empty state when there are no rows', () => {
    render(<Leaderboard rows={[]} currentUserId="u1" />)
    expect(screen.getByText('No team members yet.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- components/dashboard/Leaderboard.test.tsx`
Expected: FAIL — cannot resolve `./Leaderboard`.

- [ ] **Step 3: Implement `components/dashboard/Leaderboard.tsx`**

```tsx
'use client'
import { useState } from 'react'
import type { LeaderboardRow } from '@/lib/stats'
import { cn } from '@/lib/utils'

export type LeaderboardWindow = 'week' | 'month'

const MEDALS = ['🥇', '🥈', '🥉']

function count(r: LeaderboardRow, key: 'doors' | 'conversations' | 'sales', period: LeaderboardWindow): number {
  const raw = r[`${key}_${period}` as keyof LeaderboardRow] as string
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

/** Rank by doors desc, tie-break sales desc, then name asc (null names last). */
export function rankRows(rows: LeaderboardRow[], period: LeaderboardWindow): (LeaderboardRow & { rank: number })[] {
  return [...rows]
    .sort((a, b) =>
      count(b, 'doors', period) - count(a, 'doors', period) ||
      count(b, 'sales', period) - count(a, 'sales', period) ||
      (a.name ?? '￿').localeCompare(b.name ?? '￿'))
    .map((r, i) => ({ ...r, rank: i + 1 }))
}

type Props = {
  rows: LeaderboardRow[]
  currentUserId: string
}

export function Leaderboard({ rows, currentUserId }: Props) {
  const [period, setPeriod] = useState<LeaderboardWindow>('week')

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No team members yet.</p>
  }

  const ranked = rankRows(rows, period)

  return (
    <div className="space-y-3">
      <div className="flex w-fit overflow-hidden rounded-full border text-sm font-medium">
        {([['week', 'This Week'], ['month', 'This Month']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            aria-pressed={period === key}
            className={cn(
              'px-4 py-1.5 transition-colors',
              period === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-2 font-semibold">#</th>
            <th className="py-2 pr-2 font-semibold">Rep</th>
            <th className="py-2 pr-2 text-right font-semibold">Doors</th>
            <th className="py-2 pr-2 text-right font-semibold">Conversations</th>
            <th className="py-2 text-right font-semibold">Sales</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map(r => (
            <tr key={r.id} className={cn('border-t', r.id === currentUserId && 'bg-muted font-medium')}>
              <td className="py-2 pr-2">{r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank}</td>
              <td className="py-2 pr-2">
                {r.name ?? 'Unknown'}
                {r.id === currentUserId && (
                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">you</span>
                )}
              </td>
              <td className="py-2 pr-2 text-right">{count(r, 'doors', period)}</td>
              <td className="py-2 pr-2 text-right">{count(r, 'conversations', period)}</td>
              <td className="py-2 text-right">{count(r, 'sales', period)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- components/dashboard/Leaderboard.test.tsx`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/Leaderboard.tsx components/dashboard/Leaderboard.test.tsx
git commit -m "feat: Leaderboard component with doors-ranked table and window toggle (#7)"
```

---

### Task 3: Dashboard wiring + gates

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getLeaderboard` (Task 1), `Leaderboard` (Task 2).

- [ ] **Step 1: Rewrite `app/(app)/dashboard/page.tsx`**

Replace the whole file with:

```tsx
export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getRepStats, getManagerStats, getAdminStats, getLeaderboard, type LeaderboardRow } from '@/lib/stats'
import { Leaderboard } from '@/components/dashboard/Leaderboard'

function LeaderboardSection({ rows, userId }: { rows: LeaderboardRow[] | null; userId: string }) {
  if (!rows) return null
  return (
    <div className="max-w-lg px-6 pb-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Leaderboard</h2>
      <Leaderboard rows={rows} currentUserId={userId} />
    </div>
  )
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.role) redirect('/waiting')

  const { role, id: userId, teamId } = session.user

  if (role === 'rep') {
    const stats = await getRepStats(userId)
    const leaderboard = teamId ? await getLeaderboard(teamId) : null
    const { RepStats } = await import('@/components/dashboard/RepStats')
    return (
      <div>
        <RepStats stats={stats} />
        <LeaderboardSection rows={leaderboard} userId={userId} />
      </div>
    )
  }
  if (role === 'manager') {
    const stats = await getManagerStats(teamId!)
    const leaderboard = teamId ? await getLeaderboard(teamId) : null
    const { ManagerStats } = await import('@/components/dashboard/ManagerStats')
    return (
      <div>
        <ManagerStats stats={stats} />
        <LeaderboardSection rows={leaderboard} userId={userId} />
      </div>
    )
  }
  const stats = await getAdminStats()
  const leaderboard = await getLeaderboard(null)
  const { AdminStats } = await import('@/components/dashboard/AdminStats')
  return (
    <div>
      <AdminStats stats={stats} />
      <LeaderboardSection rows={leaderboard} userId={userId} />
    </div>
  )
}
```

**Note:** `Leaderboard` is statically imported (unlike the per-role components' dynamic imports) because it renders on every role's branch — there is nothing to defer.

- [ ] **Step 2: Full gates**

Run: `npx tsc --noEmit && npm run test:run && AUTH_GOOGLE_ID=dummy AUTH_GOOGLE_SECRET=dummy AUTH_SECRET=dummy DATABASE_URL='postgresql://dummy:dummy@localhost:5432/dummy' npm run build`
Expected: tsc clean; tests pass (single env-only `lib/auth.test.ts` failure aside); build succeeds with `/dashboard` in the route list.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/dashboard/page.tsx"
git commit -m "feat: leaderboard section on rep, manager, and admin dashboards (#7)"
```

---

## Self-Review Notes

- **Spec coverage:** query with six FILTER counts incl. UNION ALL and zero-visit reps (Task 1); rankRows ordering/tie-breaks/NaN-as-0, medals, highlight+"you" badge, week default, empty state (Task 2); three-dashboard wiring with team scoping and the no-team null case (Task 3). Out-of-scope items have no tasks.
- **Type consistency:** `LeaderboardRow` string counts flow from Task 1 through `rankRows`/`count()` coercion in Task 2; `LeaderboardWindow` named consistently; Task 3 imports match Task 1/2 exports.
- **Import style:** Leaderboard is statically imported in Task 3 (renders on every branch); the per-role components keep their existing dynamic imports untouched.
