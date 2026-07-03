CREATE TABLE IF NOT EXISTS "statuses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "color" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "auto_key" text UNIQUE,
  "created_at" timestamp DEFAULT now() NOT NULL
);

INSERT INTO "statuses" ("name", "color", "sort_order", "auto_key") VALUES
  ('Not Home',       '#94a3b8', 1, 'not_home'),
  ('Interested',     '#eab308', 2, 'interested'),
  ('Callback',       '#3b82f6', 3, 'callback'),
  ('Customer',       '#22c55e', 4, 'customer'),
  ('Not Interested', '#ef4444', 5, 'not_interested')
ON CONFLICT ("auto_key") DO NOTHING;

ALTER TABLE "houses" ADD COLUMN IF NOT EXISTS "status_id" uuid REFERENCES "statuses"("id") ON DELETE SET NULL;
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "status_id" uuid REFERENCES "statuses"("id") ON DELETE SET NULL;

-- Backfill houses from each house's most recent visit
WITH last_visits AS (
  SELECT DISTINCT ON (ho.house_id)
    ho.house_id, v.contact_status, v.interest_level, v.sale_outcome, v.follow_up_at
  FROM visits v
  JOIN households ho ON v.household_id = ho.id
  ORDER BY ho.house_id, v.created_at DESC
)
UPDATE houses h SET status_id = s.id
FROM last_visits lv
JOIN statuses s ON s.auto_key = CASE
  WHEN lv.sale_outcome = 'sold' THEN 'customer'
  WHEN lv.sale_outcome = 'follow_up' OR lv.follow_up_at IS NOT NULL THEN 'callback'
  WHEN lv.contact_status = 'refused' OR lv.interest_level = 'not_interested' OR lv.sale_outcome = 'not_sold' THEN 'not_interested'
  WHEN lv.interest_level IN ('interested', 'maybe') THEN 'interested'
  WHEN lv.contact_status = 'not_home' THEN 'not_home'
END
WHERE h.id = lv.house_id AND h.status_id IS NULL;

-- Backfill businesses from each business's most recent visit
WITH last_bvisits AS (
  SELECT DISTINCT ON (bv.business_id)
    bv.business_id, bv.contact_status, bv.interest_level, bv.sale_outcome, bv.follow_up_at
  FROM business_visits bv
  ORDER BY bv.business_id, bv.created_at DESC
)
UPDATE businesses b SET status_id = s.id
FROM last_bvisits lv
JOIN statuses s ON s.auto_key = CASE
  WHEN lv.sale_outcome = 'sold' THEN 'customer'
  WHEN lv.sale_outcome = 'follow_up' OR lv.follow_up_at IS NOT NULL THEN 'callback'
  WHEN lv.contact_status = 'refused' OR lv.interest_level = 'not_interested' OR lv.sale_outcome = 'not_sold' THEN 'not_interested'
  WHEN lv.interest_level IN ('interested', 'maybe') THEN 'interested'
  WHEN lv.contact_status = 'not_home' THEN 'not_home'
END
WHERE b.id = lv.business_id AND b.status_id IS NULL;
