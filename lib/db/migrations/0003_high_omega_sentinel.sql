CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"category" text,
	"number" text,
	"street" text,
	"city" text,
	"region" text,
	"postcode" text,
	"phone" text,
	"website" text,
	"external_id" text,
	"location" geometry(Point, 4326) NOT NULL,
	"neighborhood_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "neighborhoods" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_neighborhood_id_neighborhoods_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhoods"("id") ON DELETE no action ON UPDATE no action;