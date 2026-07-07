CREATE TABLE IF NOT EXISTS "appointments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "house_id" uuid REFERENCES "houses"("id") ON DELETE CASCADE,
  "business_id" uuid REFERENCES "businesses"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "scheduled_at" timestamp NOT NULL,
  "notes" text,
  "status" text DEFAULT 'scheduled' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "appointments_one_entity" CHECK (("house_id" IS NULL) <> ("business_id" IS NULL))
);

CREATE INDEX IF NOT EXISTS "appointments_scheduled_idx" ON "appointments" ("scheduled_at");
CREATE INDEX IF NOT EXISTS "appointments_user_idx" ON "appointments" ("user_id");
