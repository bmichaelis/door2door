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
