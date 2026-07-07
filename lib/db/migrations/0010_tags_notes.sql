CREATE TABLE IF NOT EXISTS "tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "tags_name_lower_idx" ON "tags" (lower("name"));

CREATE TABLE IF NOT EXISTS "house_tags" (
  "house_id" uuid NOT NULL REFERENCES "houses"("id") ON DELETE CASCADE,
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("house_id", "tag_id")
);

CREATE INDEX IF NOT EXISTS "house_tags_tag_idx" ON "house_tags" ("tag_id");

CREATE TABLE IF NOT EXISTS "business_tags" (
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("business_id", "tag_id")
);

CREATE INDEX IF NOT EXISTS "business_tags_tag_idx" ON "business_tags" ("tag_id");

CREATE TABLE IF NOT EXISTS "house_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "house_id" uuid NOT NULL REFERENCES "houses"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "body" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "house_notes_house_idx" ON "house_notes" ("house_id");

CREATE TABLE IF NOT EXISTS "business_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "body" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "business_notes_business_idx" ON "business_notes" ("business_id");
