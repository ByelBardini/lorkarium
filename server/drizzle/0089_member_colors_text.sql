ALTER TABLE "users" ALTER COLUMN "color" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_color_value" CHECK ("users"."color" IN ('gold', 'steel', 'ember', 'moss', 'violet', 'rose', 'teal', 'bone') OR "users"."color" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
DROP TYPE "public"."member_color";