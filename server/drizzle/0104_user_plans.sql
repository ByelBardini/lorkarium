CREATE TYPE "public"."user_plan" AS ENUM('free', 'apoiador', 'narrador', 'lenda', 'amigo_do_dono');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan" "user_plan" DEFAULT 'free' NOT NULL;--> statement-breakpoint
-- Every account born before the plans keeps today's behavior; the admin has no plan limit anyway.
UPDATE "users" SET "plan" = 'amigo_do_dono' WHERE "role" <> 'admin';
