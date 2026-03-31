# Door-to-Door Sales Platform — Design Spec

**Date:** 2026-03-31

---

## Overview

A mobile-first web platform for door-to-door sales teams. Sales reps use it in the field to track houses, log visit outcomes, and manage household records. Managers oversee their team's activity and neighborhood assignments. Admins control the full platform.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) on Cloudflare Pages |
| Database | Neon Postgres with PostGIS |
| ORM | Drizzle ORM |
| Auth | Auth.js (NextAuth v5) with Google OIDC |
| Maps | Mapbox GL JS (rendering, geocoding, address search) |
| Deployment | Cloudflare Pages + Workers |

The app is a single Next.js monolith. Route Handlers serve as the API layer — when a native mobile app is added in the future, it calls these same endpoints. No separate backend service.

---

## User Roles

Three roles with strict data boundaries:

- **Admin** — full platform access: manage users, teams, products, neighborhoods, view all data across all teams
- **Team Manager** — manages their own team: assign/remove reps, view all activity within their team's neighborhoods, no visibility into other teams
- **Sales Rep** — field access: view neighborhoods assigned to their team, add/pin houses, log visits, manage households

Data access for reps follows the **neighborhood**, not team history. A rep sees the full household and visit history for any house in their currently assigned neighborhood — even if a previous team worked that area.

---

## Data Model

### Users
- id, name, email, avatar
- role: `admin | manager | rep`
- team_id (nullable FK → Teams)

### Teams
- id, name
- manager_id (FK → Users)

### Products
- id, name, description, active flag
- Admin-managed; available platform-wide

### Neighborhoods
- id, name, team_id (FK → Teams)
- boundary: `geometry(Polygon, 4326)` — PostGIS polygon
- Can be imported (GeoJSON/ZIP/census) or drawn manually on the map

### Houses
- id, address (standardized), lat, lng
- neighborhood_id (FK → Neighborhoods) — auto-assigned via `ST_Within` on creation
- `do_not_knock` boolean — set by manager/admin (municipal registry or resident request)
- `no_soliciting_sign` boolean — set by rep (physical sign observed on property)

### Households
- id, house_id (FK → Houses)
- surname, head_of_household_name
- active boolean — only one active household per house at a time
- created_at

A House has many Households over time. When a new family moves in, the rep creates a new Household record, marking the previous one inactive. Visit history is tied to the Household, preserving full context per family.

### Visits
- id, household_id (FK → Households), user_id (FK → Users — the rep)
- contact_status: `answered | not_home | refused`
- interest_level: `interested | not_interested | maybe`
- notes (text)
- follow_up_at (datetime, nullable)
- sale_outcome: `sold | not_sold | pending` (nullable)
- product_id (FK → Products, nullable)
- install_date / service_date (date, nullable)
- created_at

---

## Geographic Features

### Neighborhood Management (Admin)
- Import boundaries via GeoJSON upload or by selecting ZIP codes / census tracts
- Draw/edit custom polygon boundaries on Mapbox interactive map
- Assign neighborhood to a team
- Boundaries stored as PostGIS polygons

### House Management
- **Bulk import**: CSV upload with addresses; Mapbox Geocoding API resolves lat/lng
- **On the fly**: rep searches address via Mapbox autocomplete or taps map to pin location
- On creation, `ST_Within` query auto-assigns the house to the correct neighborhood
- Reps can correct address or reposition pin if geocoding is inaccurate

### Rep Field Map View
- Map centered on team's assigned neighborhoods
- House pins color-coded by last visit outcome:
  - Grey — not yet visited
  - Green — sold
  - Yellow — interested / maybe
  - Red — refused / not interested
  - Black with warning icon — Do Not Knock or No Soliciting sign
- Tapping a house opens household info, full visit history, and the new visit form

---

## Legal & Compliance

Two house-level flags protect the company from solicitation violations:

- **Do Not Knock** (`do_not_knock`): Set by managers/admins. Used for houses on municipal Do Not Knock registries or those that have explicitly requested no contact. Not household-specific — applies to the physical address permanently until removed.
- **No Soliciting Sign** (`no_soliciting_sign`): Set by reps when they observe a physical sign on the property.

Both flags:
- Display a prominent warning icon on the map
- Show a blocking confirmation prompt when a rep attempts to log a visit ("This house is flagged — are you sure you want to proceed?")
- Are logged in visit history to create an audit trail

Only managers/admins can set `do_not_knock`. Reps can set `no_soliciting_sign`.

---

## Key UI Flows

### Rep — Field Visit
1. Opens app, map loads centered on their team's neighborhoods
2. Taps a house pin → sees household surname, contact history summary, last visit outcome
3. Reviews full visit history (previous households labeled separately)
4. Taps "Log Visit" → fills contact status, interest, notes, product, sale outcome, install date
5. Submits → map pin reflects updated outcome on next map load

### Rep — New House
1. Taps empty map area or uses address search
2. Confirms or adjusts pin location
3. Enters address (pre-filled from geocoding)
4. House created, assigned to neighborhood automatically
5. Proceeds to log first visit

### Rep — New Household
1. On a house detail view, taps "New Family Moved In"
2. Enters new surname / head of household
3. Previous household marked inactive; new household is now active
4. Visit history from previous household remains visible but clearly labeled

### Manager — Team Overview
1. Views neighborhood map with all team activity
2. Filters by rep, date range, outcome
3. Accesses rep activity stats from dashboard

### Admin — Neighborhood Setup
1. Creates neighborhood by importing GeoJSON or drawing polygon
2. Names it, assigns to a team
3. Optionally bulk-imports houses via CSV

---

## Dashboards

Scoped by role:

**Rep Dashboard**
- Visits logged today / this week
- Sales closed
- Upcoming follow-ups

**Manager Dashboard**
- Team visit and sales summary
- Visits / sales breakdown by rep
- Neighborhood coverage (% of houses visited)

**Admin Dashboard**
- Platform-wide stats
- Sales by team and product
- User and team management

---

## Authentication

- Google OIDC via Auth.js (NextAuth v5)
- Sessions stored in Neon via Drizzle adapter
- Role assigned by admin after first login; new users who sign in see a "waiting for access" screen until an admin assigns them a role and team

---

## Future Considerations

- Native iOS/Android app (API layer already in place via Route Handlers)
- Municipal Do Not Knock registry imports (CSV/API integration)
- Push notifications for follow-up reminders
- Offline support / local-first visit logging for poor connectivity areas
