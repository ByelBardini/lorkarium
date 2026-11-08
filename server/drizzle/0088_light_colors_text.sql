ALTER TABLE "lights" ALTER COLUMN "color" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "tokens" ALTER COLUMN "light_color" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "lights" ADD CONSTRAINT "lights_color_value" CHECK ("lights"."color" IN ('torch', 'candle', 'fire', 'moon', 'arcane', 'necrotic', 'infernal') OR "lights"."color" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_light_color_value" CHECK ("tokens"."light_color" IN ('torch', 'candle', 'fire', 'moon', 'arcane', 'necrotic', 'infernal') OR "tokens"."light_color" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
DROP TYPE "public"."light_color";