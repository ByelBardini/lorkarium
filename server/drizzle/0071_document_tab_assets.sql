ALTER TABLE "library_document_assets" ADD COLUMN "tab_id" uuid;--> statement-breakpoint
-- Edited by hand: every existing reference (confirmed or prepared) belongs to the only tab 0070
-- created, "Geral", before the column becomes NOT NULL and part of the key.
UPDATE "library_document_assets" AS r SET "tab_id" = t."id"
FROM "library_document_tabs" AS t
WHERE t."campaign_id" = r."campaign_id" AND t."document_id" = r."document_id" AND t."position" = 0;--> statement-breakpoint
ALTER TABLE "library_document_assets" ALTER COLUMN "tab_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "library_document_assets" DROP CONSTRAINT "library_document_assets_campaign_id_document_id_asset_id_pk";--> statement-breakpoint
ALTER TABLE "library_document_assets" ADD CONSTRAINT "library_document_assets_campaign_id_document_id_asset_id_tab_id_pk" PRIMARY KEY("campaign_id","document_id","asset_id","tab_id");--> statement-breakpoint
ALTER TABLE "library_document_assets" ADD CONSTRAINT "library_document_assets_tab_fk" FOREIGN KEY ("campaign_id","document_id","tab_id") REFERENCES "public"."library_document_tabs"("campaign_id","document_id","id") ON DELETE cascade ON UPDATE no action;
