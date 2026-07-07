CREATE TABLE IF NOT EXISTS "house_photos" (
  "id" uuid PRIMARY KEY NOT NULL,
  "house_id" uuid NOT NULL REFERENCES "houses"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "r2_key" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "house_photos_house_idx" ON "house_photos" ("house_id");

CREATE TABLE IF NOT EXISTS "business_photos" (
  "id" uuid PRIMARY KEY NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "r2_key" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "business_photos_business_idx" ON "business_photos" ("business_id");
