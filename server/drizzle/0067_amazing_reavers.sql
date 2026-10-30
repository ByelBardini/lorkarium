ALTER TYPE "public"."asset_purpose" ADD VALUE 'library_image';--> statement-breakpoint
CREATE TABLE "library_image_presentations" (
	"campaign_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"presentation_id" uuid,
	"image_id" uuid,
	"name_at_presentation" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_image_presentations_version" CHECK ("library_image_presentations"."version" >= 0),
	CONSTRAINT "library_image_presentations_complete" CHECK (("library_image_presentations"."presentation_id" IS NULL AND "library_image_presentations"."image_id" IS NULL AND "library_image_presentations"."name_at_presentation" IS NULL) OR ("library_image_presentations"."presentation_id" IS NOT NULL AND "library_image_presentations"."image_id" IS NOT NULL AND "library_image_presentations"."name_at_presentation" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "library_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"folder_id" uuid,
	"asset_id" uuid NOT NULL,
	"name" text NOT NULL,
	"visibility" "scene_visibility" DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_images_campaign_id_id_unique" UNIQUE("campaign_id","id"),
	CONSTRAINT "library_images_asset_unique" UNIQUE("asset_id"),
	CONSTRAINT "library_images_name_length" CHECK (char_length("library_images"."name") BETWEEN 1 AND 60)
);
--> statement-breakpoint
ALTER TABLE "library_image_presentations" ADD CONSTRAINT "library_image_presentations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_image_presentations" ADD CONSTRAINT "library_image_presentations_image_fk" FOREIGN KEY ("campaign_id","image_id") REFERENCES "public"."library_images"("campaign_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_images" ADD CONSTRAINT "library_images_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_campaign_id_id_unique" ON "assets" USING btree ("campaign_id","id");--> statement-breakpoint
ALTER TABLE "library_images" ADD CONSTRAINT "library_images_asset_fk" FOREIGN KEY ("campaign_id","asset_id") REFERENCES "public"."assets"("campaign_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_images" ADD CONSTRAINT "library_images_folder_fk" FOREIGN KEY ("campaign_id","folder_id") REFERENCES "public"."scene_folders"("campaign_id","id") ON DELETE SET NULL ("folder_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_images_campaign_idx" ON "library_images" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "library_images_folder_idx" ON "library_images" USING btree ("campaign_id","folder_id");--> statement-breakpoint
