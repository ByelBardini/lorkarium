ALTER TABLE "auth_sessions" ADD COLUMN "public_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_public_id_unique" UNIQUE("public_id");--> statement-breakpoint
-- Sessions open before this migration: their last activity is unknown, so it starts at the login.
UPDATE "auth_sessions" SET "last_seen_at" = "created_at";
