ALTER TYPE "public"."asset_purpose" ADD VALUE 'sheet_image';--> statement-breakpoint
CREATE TABLE "sheet_assets" (
	"campaign_id" uuid NOT NULL,
	"sheet_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "sheet_assets_campaign_id_sheet_id_asset_id_pk" PRIMARY KEY("campaign_id","sheet_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "sheet_assets" ADD CONSTRAINT "sheet_assets_sheet_fk" FOREIGN KEY ("campaign_id","sheet_id") REFERENCES "public"."token_sheets"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_assets" ADD CONSTRAINT "sheet_assets_asset_fk" FOREIGN KEY ("campaign_id","asset_id") REFERENCES "public"."assets"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sheet_assets_asset_idx" ON "sheet_assets" USING btree ("campaign_id","asset_id");