CREATE TYPE "public"."aura_effect" AS ENUM('fire', 'water', 'lightning', 'frost', 'radiant', 'shadow', 'poison', 'arcane');--> statement-breakpoint
CREATE TYPE "public"."token_aura_kind" AS ENUM('color', 'effect', 'image');--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "aura_kind" "token_aura_kind";--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "aura_radius" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "aura_color" "drawing_color";--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "aura_effect" "aura_effect";--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "aura_image_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "aura_opacity" smallint;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_aura_image_asset_id_assets_id_fk" FOREIGN KEY ("aura_image_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_aura_shape" CHECK (("tokens"."aura_kind" IS NULL AND "tokens"."aura_radius" IS NULL AND "tokens"."aura_color" IS NULL AND "tokens"."aura_effect" IS NULL AND "tokens"."aura_image_asset_id" IS NULL AND "tokens"."aura_opacity" IS NULL) OR ("tokens"."aura_kind" IS NOT NULL AND "tokens"."aura_radius" IS NOT NULL AND "tokens"."aura_opacity" IS NOT NULL AND "tokens"."aura_radius" BETWEEN 0 AND 20 AND "tokens"."aura_opacity" BETWEEN 10 AND 100));--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_aura_fields" CHECK (("tokens"."aura_kind" IS DISTINCT FROM 'color' OR "tokens"."aura_color" IS NOT NULL) AND (("tokens"."aura_effect" IS NOT NULL) = ("tokens"."aura_kind" IS NOT DISTINCT FROM 'effect')) AND ("tokens"."aura_color" IS NULL OR "tokens"."aura_kind" IS NOT DISTINCT FROM 'color' OR "tokens"."aura_kind" IS NOT DISTINCT FROM 'effect') AND ("tokens"."aura_image_asset_id" IS NULL OR "tokens"."aura_kind" IS NOT DISTINCT FROM 'image'));