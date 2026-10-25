ALTER TABLE "users" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_version" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_terms_acceptance_pair" CHECK (("users"."terms_accepted_at" IS NULL) = ("users"."terms_version" IS NULL));