ALTER TABLE "campaigns" ADD COLUMN "photo_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "banner_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_photo_asset_id_assets_id_fk" FOREIGN KEY ("photo_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_banner_asset_id_assets_id_fk" FOREIGN KEY ("banner_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;