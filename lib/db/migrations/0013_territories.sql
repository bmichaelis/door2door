ALTER TABLE "neighborhoods" ADD COLUMN IF NOT EXISTS "assigned_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "neighborhoods" ADD COLUMN IF NOT EXISTS "territory_status" text;

CREATE INDEX IF NOT EXISTS "neighborhoods_assigned_user_idx" ON "neighborhoods" ("assigned_user_id");
