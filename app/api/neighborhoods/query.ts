import { sql, type SQL } from 'drizzle-orm'

/**
 * The neighborhoods list query. By default filters out neighborhoods with zero
 * houses (`HAVING COUNT(h.id) > 0`) to keep the map payload lean — boundaries
 * are also simplified server-side (0.0001° ≈ 10m), shrinking ~1428 polygons
 * from ~6 MB to ~1 MB. Pass `includeEmpty` to return all neighborhoods; the
 * /territories management page needs empty ones so they can be assigned.
 */
export function neighborhoodsListQuery(includeEmpty: boolean): SQL {
  const having = includeEmpty ? sql`` : sql`HAVING COUNT(h.id) > 0`
  return sql`
    SELECT n.id, n.name, n.team_id, n.created_at,
      n.assigned_user_id as "assignedUserId",
      n.territory_status as "territoryStatus",
      u.name as "assignedUserName",
      ST_AsGeoJSON(ST_SimplifyPreserveTopology(n.boundary, 0.0001))::json as boundary,
      COUNT(h.id)::int as "houseCount"
    FROM neighborhoods n
    LEFT JOIN users u ON u.id = n.assigned_user_id
    LEFT JOIN houses h ON h.neighborhood_id = n.id
    GROUP BY n.id, u.name
    ${having}
    ORDER BY n.name`
}
