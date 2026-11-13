ALTER TABLE "library_documents" ADD COLUMN "preview_summary" text;--> statement-breakpoint
ALTER TABLE "library_documents" ADD COLUMN "preview_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "library_documents" ADD CONSTRAINT "library_documents_preview_asset_id_assets_id_fk" FOREIGN KEY ("preview_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_documents" ADD CONSTRAINT "library_documents_preview_summary_length" CHECK (char_length("library_documents"."preview_summary") between 1 and 280);