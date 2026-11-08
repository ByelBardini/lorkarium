ALTER TABLE "characters" ALTER COLUMN "aura_color" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "drawings" ALTER COLUMN "stroke" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "drawings" ALTER COLUMN "fill" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "effect_areas" ALTER COLUMN "color" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "tokens" ALTER COLUMN "aura_color" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_aura_color_value" CHECK ("characters"."aura_color" IN ('gold', 'steel', 'ember', 'moss', 'ash', 'ink', 'bone', 'violet') OR "characters"."aura_color" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_stroke_color" CHECK ("drawings"."stroke" IN ('gold', 'steel', 'ember', 'moss', 'ash', 'ink', 'bone', 'violet') OR "drawings"."stroke" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_fill_color" CHECK ("drawings"."fill" IN ('gold', 'steel', 'ember', 'moss', 'ash', 'ink', 'bone', 'violet') OR "drawings"."fill" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
ALTER TABLE "effect_areas" ADD CONSTRAINT "effect_areas_color_value" CHECK ("effect_areas"."color" IN ('gold', 'steel', 'ember', 'moss', 'ash', 'ink', 'bone', 'violet') OR "effect_areas"."color" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_aura_color_value" CHECK ("tokens"."aura_color" IN ('gold', 'steel', 'ember', 'moss', 'ash', 'ink', 'bone', 'violet') OR "tokens"."aura_color" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
DROP TYPE "public"."drawing_color";