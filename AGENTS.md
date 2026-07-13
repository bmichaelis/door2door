<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Database migrations

Before hand-editing `lib/db/migrations/meta/_journal.json`, read
`lib/db/migrations/README.md`: a new entry's `when` must be the real current
epoch-ms and strictly greater than the previous entry's, or `drizzle-kit`
silently skips the migration.
