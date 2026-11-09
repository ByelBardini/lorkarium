CREATE TYPE "public"."map_region_link_kind" AS ENUM('document', 'scene', 'map', 'image');--> statement-breakpoint
ALTER TYPE "public"."asset_purpose" ADD VALUE 'library_map';--> statement-breakpoint
CREATE TABLE "library_map_regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"geometry" jsonb NOT NULL,
	"color" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"link_kind" "map_region_link_kind",
	"target_document_id" uuid,
	"target_scene_id" uuid,
	"target_map_id" uuid,
	"target_image_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_map_regions_name_length" CHECK (char_length("library_map_regions"."name") BETWEEN 1 AND 60),
	CONSTRAINT "library_map_regions_description_length" CHECK (char_length("library_map_regions"."description") <= 500),
	CONSTRAINT "library_map_regions_color_hex" CHECK ("library_map_regions"."color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "library_map_regions_link_target" CHECK (num_nonnulls("library_map_regions"."target_document_id", "library_map_regions"."target_scene_id", "library_map_regions"."target_map_id", "library_map_regions"."target_image_id") <= 1 AND ("library_map_regions"."target_document_id" IS NULL OR "library_map_regions"."link_kind" IS NOT DISTINCT FROM 'document') AND ("library_map_regions"."target_scene_id" IS NULL OR "library_map_regions"."link_kind" IS NOT DISTINCT FROM 'scene') AND ("library_map_regions"."target_map_id" IS NULL OR "library_map_regions"."link_kind" IS NOT DISTINCT FROM 'map') AND ("library_map_regions"."target_image_id" IS NULL OR "library_map_regions"."link_kind" IS NOT DISTINCT FROM 'image'))
);
--> statement-breakpoint
CREATE TABLE "library_maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"folder_id" uuid,
	"asset_id" uuid NOT NULL,
	"name" text NOT NULL,
	"visibility" "scene_visibility" DEFAULT 'private' NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_maps_campaign_id_id_unique" UNIQUE("campaign_id","id"),
	CONSTRAINT "library_maps_asset_unique" UNIQUE("asset_id"),
	CONSTRAINT "library_maps_name_length" CHECK (char_length("library_maps"."name") BETWEEN 1 AND 60),
	CONSTRAINT "library_maps_version_nonnegative" CHECK ("library_maps"."version" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "scenes_campaign_id_id_unique" ON "scenes" USING btree ("campaign_id","id");--> statement-breakpoint
ALTER TABLE "library_map_regions" ADD CONSTRAINT "library_map_regions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_map_regions" ADD CONSTRAINT "library_map_regions_map_fk" FOREIGN KEY ("campaign_id","map_id") REFERENCES "public"."library_maps"("campaign_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_map_regions" ADD CONSTRAINT "library_map_regions_target_document_fk" FOREIGN KEY ("campaign_id","target_document_id") REFERENCES "public"."library_documents"("campaign_id","id") ON DELETE SET NULL ("target_document_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_map_regions" ADD CONSTRAINT "library_map_regions_target_scene_fk" FOREIGN KEY ("campaign_id","target_scene_id") REFERENCES "public"."scenes"("campaign_id","id") ON DELETE SET NULL ("target_scene_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_map_regions" ADD CONSTRAINT "library_map_regions_target_map_fk" FOREIGN KEY ("campaign_id","target_map_id") REFERENCES "public"."library_maps"("campaign_id","id") ON DELETE SET NULL ("target_map_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_map_regions" ADD CONSTRAINT "library_map_regions_target_image_fk" FOREIGN KEY ("campaign_id","target_image_id") REFERENCES "public"."library_images"("campaign_id","id") ON DELETE SET NULL ("target_image_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_maps" ADD CONSTRAINT "library_maps_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_maps" ADD CONSTRAINT "library_maps_asset_fk" FOREIGN KEY ("campaign_id","asset_id") REFERENCES "public"."assets"("campaign_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_maps" ADD CONSTRAINT "library_maps_folder_fk" FOREIGN KEY ("campaign_id","folder_id") REFERENCES "public"."scene_folders"("campaign_id","id") ON DELETE SET NULL ("folder_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_map_regions_map_idx" ON "library_map_regions" USING btree ("campaign_id","map_id");--> statement-breakpoint
CREATE INDEX "library_map_regions_target_document_idx" ON "library_map_regions" USING btree ("campaign_id","target_document_id");--> statement-breakpoint
CREATE INDEX "library_map_regions_target_scene_idx" ON "library_map_regions" USING btree ("campaign_id","target_scene_id");--> statement-breakpoint
CREATE INDEX "library_map_regions_target_map_idx" ON "library_map_regions" USING btree ("campaign_id","target_map_id");--> statement-breakpoint
CREATE INDEX "library_map_regions_target_image_idx" ON "library_map_regions" USING btree ("campaign_id","target_image_id");--> statement-breakpoint
CREATE INDEX "library_maps_folder_idx" ON "library_maps" USING btree ("campaign_id","folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_maps_one_main_unique" ON "library_maps" USING btree ("campaign_id") WHERE "library_maps"."is_main";