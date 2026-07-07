import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import type { AgendaRow, AgendaScope } from './appointments'

/** Scheduled appointments joined to their entity, role-scoped, time-ascending.
 * Shared by the /appointments page and GET /api/appointments so they can't drift. */
export async function getAgenda(scope: AgendaScope): Promise<AgendaRow[]> {
  const repFilter =
    scope.role === 'rep' ? sql`AND a.user_id = ${scope.userId}` :
    scope.role === 'manager' && scope.teamId ? sql`AND u.team_id = ${scope.teamId}` :
    sql``
  const rows = await db.execute(sql`
    SELECT
      a.id,
      a.scheduled_at AS "scheduledAt",
      a.notes,
      a.status,
      u.name AS "repName",
      CASE WHEN a.house_id IS NOT NULL THEN 'house' ELSE 'business' END AS entity,
      CASE WHEN a.house_id IS NOT NULL THEN h.number || ' ' || h.street ELSE b.name END AS label,
      CASE WHEN a.house_id IS NOT NULL THEN h.city || ' — ' || COALESCE(ho.surname, 'No household')
           ELSE COALESCE(b.city, '') END AS sublabel,
      CASE WHEN a.house_id IS NOT NULL THEN ST_Y(h.location) ELSE ST_Y(b.location) END AS lat,
      CASE WHEN a.house_id IS NOT NULL THEN ST_X(h.location) ELSE ST_X(b.location) END AS lng
    FROM appointments a
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN houses h ON h.id = a.house_id
    LEFT JOIN businesses b ON b.id = a.business_id
    LEFT JOIN LATERAL (
      SELECT surname FROM households ho2
      WHERE ho2.house_id = a.house_id AND ho2.active = true LIMIT 1
    ) ho ON true
    WHERE a.status = 'scheduled' ${repFilter}
    ORDER BY a.scheduled_at ASC
  `)
  return rows.rows as AgendaRow[]
}
