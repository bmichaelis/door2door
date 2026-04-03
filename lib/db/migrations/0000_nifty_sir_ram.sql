CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"house_id" uuid NOT NULL,
	"surname" text,
	"head_of_household_name" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "houses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"neighborhood_id" uuid,
	"do_not_knock" boolean DEFAULT false NOT NULL,
	"no_soliciting_sign" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "neighborhoods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"team_id" uuid,
	"boundary" geometry(Polygon, 4326),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"manager_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"role" text,
	"team_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"contact_status" text NOT NULL,
	"interest_level" text,
	"notes" text,
	"follow_up_at" timestamp,
	"sale_outcome" text,
	"product_id" uuid,
	"install_date" timestamp,
	"service_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "houses" ADD CONSTRAINT "houses_neighborhood_id_neighborhoods_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhoods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighborhoods" ADD CONSTRAINT "neighborhoods_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;