CREATE TYPE "public"."scene_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TABLE "scene_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scene_folders_campaign_id_id_unique" UNIQUE("campaign_id","id"),
	CONSTRAINT "scene_folders_name_length" CHECK (char_length("scene_folders"."name") BETWEEN 1 AND 40)
);
--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "visibility" "scene_visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
-- The scenes of today were the one board every member saw: they stay public.
UPDATE "scenes" SET "visibility" = 'public';--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "scene_folders" ADD CONSTRAINT "scene_folders_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_folders" ADD CONSTRAINT "scene_folders_parent_fk" FOREIGN KEY ("campaign_id","parent_id") REFERENCES "public"."scene_folders"("campaign_id","id") ON DELETE SET NULL ("parent_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scene_folders_campaign_id_idx" ON "scene_folders" USING btree ("campaign_id");--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_folder_fk" FOREIGN KEY ("campaign_id","folder_id") REFERENCES "public"."scene_folders"("campaign_id","id") ON DELETE SET NULL ("folder_id") ON UPDATE no action;