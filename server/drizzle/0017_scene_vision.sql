CREATE TYPE "public"."scene_vision" AS ENUM('off', 'dark', 'daylight');--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "vision_mode" "scene_vision" DEFAULT 'off' NOT NULL;