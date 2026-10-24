CREATE TYPE "public"."scene_kind" AS ENUM('grid', 'cast');--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "kind" "scene_kind" DEFAULT 'grid' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "scenes_one_cast_per_campaign" ON "scenes" USING btree ("campaign_id") WHERE "scenes"."kind" = 'cast';--> statement-breakpoint
-- Every table that already existed gets its cast: the hidden scene of the characters' anchors.
INSERT INTO "scenes" ("campaign_id", "name", "kind") SELECT "id", 'Elenco', 'cast' FROM "campaigns";
