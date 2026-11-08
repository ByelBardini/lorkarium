ALTER TABLE "character_bars" ALTER COLUMN "color" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "token_bars" ALTER COLUMN "color" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "character_bars" ADD CONSTRAINT "character_bars_color_value" CHECK ("character_bars"."color" IN ('gold', 'steel', 'ember', 'moss', 'ash') OR "character_bars"."color" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
ALTER TABLE "token_bars" ADD CONSTRAINT "token_bars_color_value" CHECK ("token_bars"."color" IN ('gold', 'steel', 'ember', 'moss', 'ash') OR "token_bars"."color" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
DROP TYPE "public"."bar_color";