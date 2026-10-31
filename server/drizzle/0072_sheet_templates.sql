CREATE TABLE "sheet_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"folder_id" uuid,
	"name" text NOT NULL,
	"html" text NOT NULL,
	"css" text NOT NULL,
	"js" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sheet_templates_campaign_id_id_unique" UNIQUE("campaign_id","id"),
	CONSTRAINT "sheet_templates_name_length" CHECK (char_length("sheet_templates"."name") between 1 and 60),
	CONSTRAINT "sheet_templates_version_nonnegative" CHECK ("sheet_templates"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "sheet_templates" ADD CONSTRAINT "sheet_templates_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_templates" ADD CONSTRAINT "sheet_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_templates" ADD CONSTRAINT "sheet_templates_folder_fk" FOREIGN KEY ("campaign_id","folder_id") REFERENCES "public"."scene_folders"("campaign_id","id") ON DELETE SET NULL ("folder_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sheet_templates_folder_idx" ON "sheet_templates" USING btree ("campaign_id","folder_id");