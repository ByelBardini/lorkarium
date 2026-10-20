CREATE TYPE "public"."light_color" AS ENUM('torch', 'candle', 'fire', 'moon', 'arcane', 'necrotic', 'infernal');--> statement-breakpoint
ALTER TABLE "lights" ADD COLUMN "color" "light_color";