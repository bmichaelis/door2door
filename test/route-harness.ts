// Hermetic route-test harness. Tests mock @/lib/db with `dbMock` and @/lib/auth's
// `auth`, then invoke the exported route handler and assert on the NextResponse.
//
// Copy-paste header for a route test file (vi.mock is hoisted above imports, so
// the factory dynamic-imports this module to share the singleton dbMock):
//
//   import { vi } from 'vitest'
//   vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
//   vi.mock('@/lib/db', async () => ({ db: (await import('@/test/route-harness')).dbMock }))
//
import { NextRequest } from 'next/server'

export function jsonRequest(method: string, url: string, body?: unknown): NextRequest {
  const init: { method: string; body?: string; headers?: Record<string, string> } = { method }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  return new NextRequest(new URL(url, 'http://localhost').toString(), init)
}

export function params(obj: Record<string, string>): { params: Promise<Record<string, string>> } {
  return { params: Promise.resolve(obj) }
}

type Op = 'select' | 'insert' | 'update' | 'delete' | 'execute'
type Queues = Partial<Record<Op, unknown[]>>

// A chain object is both chainable (every builder method returns it) and
// thenable (awaiting it resolves the next queued result for the op it began as).
function makeChain(op: Op, pull: (op: Op) => unknown) {
  const chain: Record<string, unknown> = {}
  const passthrough = ['from', 'where', 'set', 'values', 'returning', 'onConflictDoNothing', 'orderBy', 'limit', 'groupBy', 'leftJoin', 'innerJoin', 'catch']
  for (const m of passthrough) chain[m] = () => chain
  chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
    try { resolve(pull(op)) } catch (e) { if (reject) reject(e); else throw e }
  }
  return chain
}

class DbMock {
  private queues: Queues = {}
  configure(queues: Queues) { this.queues = queues }
  reset() { this.queues = {} }
  private pull(op: Op): unknown {
    const q = this.queues[op]
    if (!q || q.length === 0) throw new Error(`dbMock: no queued result for '${op}'`)
    return q.shift()
  }
  select() { return makeChain('select', o => this.pull(o)) }
  insert() { return makeChain('insert', o => this.pull(o)) }
  update() { return makeChain('update', o => this.pull(o)) }
  delete() { return makeChain('delete', o => this.pull(o)) }
  execute() { return Promise.resolve(this.pull('execute')) }
}

export const dbMock = new DbMock()
