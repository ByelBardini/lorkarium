CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text DEFAULT 'Cena 1' NOT NULL,
	"width_cells" integer DEFAULT 20 NOT NULL,
	"height_cells" integer DEFAULT 12 NOT NULL,
	"cell_distance" numeric(6, 2) DEFAULT '1.5' NOT NULL,
	"cell_unit" text DEFAULT 'm' NOT NULL,
	"grid_visible" boolean DEFAULT true NOT NULL,
	"grid_opacity" integer DEFAULT 30 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "active_scene_id" uuid;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scenes_campaign_id_idx" ON "scenes" USING btree ("campaign_id");--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_active_scene_id_scenes_id_fk" FOREIGN KEY ("active_scene_id") REFERENCES "public"."scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Every campaign that already exists gets its scene (spec §3.2: one per campaign for now).
INSERT INTO "scenes" ("campaign_id") SELECT "id" FROM "campaigns";--> statement-breakpoint
UPDATE "campaigns" SET "active_scene_id" = "scenes"."id" FROM "scenes" WHERE "scenes"."campaign_id" = "campaigns"."id";
