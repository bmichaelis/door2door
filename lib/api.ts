import { NextRequest, NextResponse } from 'next/server'
import { ForbiddenError } from '@/lib/permissions'

type Ctx = { params: Promise<Record<string, string>> }
type Handler = (req: NextRequest, ctx: Ctx) => Promise<NextResponse>

export function withErrorHandling(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx)
    } catch (e) {
      if (e instanceof ForbiddenError) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      console.error(e)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}
