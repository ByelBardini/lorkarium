CREATE TYPE "public"."token_frame" AS ENUM('square', 'round');--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "image_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "frame" "token_frame" DEFAULT 'square' NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "flip_x" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "flip_y" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "facing" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_image_asset_id_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_facing_range" CHECK ("tokens"."facing" >= 0 AND "tokens"."facing" <= 359);