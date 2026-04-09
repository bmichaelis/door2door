-- Clear existing house data (no legacy data — safe to truncate)
TRUNCATE "houses" CASCADE;
--> statement-breakpoint
ALTER TABLE "houses" DROP COLUMN "address";
--> statement-breakpoint
ALTER TABLE "houses" DROP COLUMN "lat";
--> statement-breakpoint
ALTER TABLE "houses" DROP COLUMN "lng";
--> statement-breakpoint
ALTER TABLE "houses" ADD COLUMN "number" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "houses" ADD COLUMN "street" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "houses" ADD COLUMN "unit" text;
--> statement-breakpoint
ALTER TABLE "houses" ADD COLUMN "city" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "houses" ADD COLUMN "region" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "houses" ADD COLUMN "postcode" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "houses" ADD COLUMN "external_id" text;
--> statement-breakpoint
ALTER TABLE "houses" ADD COLUMN "location" geometry(Point, 4326) NOT NULL;
--> statement-breakpoint
ALTER TABLE "houses" ADD CONSTRAINT "houses_external_id_unique" UNIQUE("external_id");
