ALTER TABLE "token_sheets" DROP CONSTRAINT "token_sheets_token_id_unique";--> statement-breakpoint
ALTER TABLE "token_sheets" DROP CONSTRAINT "token_sheets_token_id_tokens_id_fk";
--> statement-breakpoint
ALTER TABLE "token_sheets" ALTER COLUMN "token_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "token_sheets" ADD COLUMN "name" text;--> statement-breakpoint
UPDATE "token_sheets" SET "name" = "sheet_templates"."name" FROM "sheet_templates" WHERE "sheet_templates"."campaign_id" = "token_sheets"."campaign_id" AND "sheet_templates"."id" = "token_sheets"."template_id";--> statement-breakpoint
ALTER TABLE "token_sheets" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "token_sheets" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "token_sheets" ADD CONSTRAINT "token_sheets_folder_fk" FOREIGN KEY ("campaign_id","folder_id") REFERENCES "public"."scene_folders"("campaign_id","id") ON DELETE SET NULL ("folder_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_sheets" ADD CONSTRAINT "token_sheets_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "token_sheets_token_idx" ON "token_sheets" USING btree ("campaign_id","token_id");--> statement-breakpoint
CREATE INDEX "token_sheets_folder_idx" ON "token_sheets" USING btree ("campaign_id","folder_id");--> statement-breakpoint
ALTER TABLE "token_sheets" ADD CONSTRAINT "token_sheets_name_length" CHECK (char_length("token_sheets"."name") between 1 and 60);
