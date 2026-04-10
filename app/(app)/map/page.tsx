export const runtime = 'edge'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { MapShell } from '@/components/map/MapShell'

export default async function MapPage() {
  const session = await auth()
  if (!session?.user?.role) redirect('/waiting')

  const neighborhoodRows = session.user.role === 'admin'
    ? await db.execute(sql`SELECT id, name, team_id, created_at, ST_AsGeoJSON(boundary)::json as boundary FROM neighborhoods`)
    : await db.execute(sql`SELECT id, name, team_id, created_at, ST_AsGeoJSON(boundary)::json as boundary FROM neighborhoods WHERE team_id = ${session.user.teamId}`)

  const neighborhoodIds = neighborhoodRows.rows.map((n: any) => n.id as string)

  const houseRows = neighborhoodIds.length > 0
    ? await db.execute(
        sql`SELECT
              h.id, h.number, h.street, h.unit, h.city, h.region, h.postcode,
              h.external_id AS "externalId",
              ST_Y(h.location) AS lat, ST_X(h.location) AS lng,
              h.neighborhood_id AS "neighborhoodId",
              h.do_not_knock AS "doNotKnock",
              h.no_soliciting_sign AS "noSolicitingSign",
              h.created_at AS "createdAt",
              v.sale_outcome AS last_outcome, v.interest_level AS last_interest
            FROM houses h
            LEFT JOIN LATERAL (
              SELECT vi.sale_outcome, vi.interest_level FROM visits vi
              JOIN households ho ON vi.household_id = ho.id
              WHERE ho.house_id = h.id
              ORDER BY vi.created_at DESC LIMIT 1
            ) v ON true
            WHERE h.neighborhood_id IN (${sql.join(neighborhoodIds.map(id => sql`${id}::uuid`), sql`, `)})`
      )
    : { rows: [] }

  return (
    <MapShell
      neighborhoods={neighborhoodRows.rows as any}
      houses={houseRows.rows as any}
      userRole={session.user.role}
    />
  )
}
