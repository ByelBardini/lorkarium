CREATE TYPE "public"."token_patrol_gait" AS ENUM('glide', 'step');--> statement-breakpoint
ALTER TABLE "token_patrols" ADD COLUMN "gait" "token_patrol_gait" DEFAULT 'glide' NOT NULL;