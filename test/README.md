# Route tests

Edge API route handlers are tested by mocking `@/lib/auth` and `@/lib/db`,
invoking the exported handler, and asserting on the returned `NextResponse`.
This covers guard/validation logic (roles, ownership, status codes, field
rules) — NOT SQL correctness (the pure helpers are unit-tested separately;
real queries are exercised by post-deploy smoke).

## Writing a route test

Header (the `@/lib/db` factory dynamic-imports the harness so the singleton
`dbMock` is shared between the mock and your test body):

    import { vi } from 'vitest'
    vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
    vi.mock('@/lib/db', async () => ({ db: (await import('@/test/route-harness')).dbMock }))

Then import the handler + `auth`, and in each test:

    ;(auth as Mock).mockResolvedValue({ user: { id: 'a1', role: 'admin' } })
    dbMock.configure({ select: [[existingRow]], update: [[updatedRow]] })
    const res = await PATCH(jsonRequest('PATCH', '/api/x/1', { … }), params({ id: '1' }))
    expect(res.status).toBe(200)

`dbMock.configure({ op: [result, …] })` queues results per drizzle op
(`select`/`insert`/`update`/`delete`/`execute`), consumed in await order.
Reset with `dbMock.reset()` in `beforeEach`. See
`app/api/statuses/[id]/route.test.ts` for a full example.
