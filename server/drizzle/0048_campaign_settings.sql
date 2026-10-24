CREATE TYPE "public"."campaign_status" AS ENUM('building', 'recruiting', 'ongoing', 'finished');--> statement-breakpoint
ALTER TYPE "public"."asset_purpose" ADD VALUE 'cover';--> statement-breakpoint
-- The status was free text: the three labels the client offered map to their value, anything
-- else (or nothing) becomes "building".
ALTER TABLE "campaigns" ALTER COLUMN "status" SET DATA TYPE "public"."campaign_status" USING (
	CASE "status"
		WHEN 'Recrutando' THEN 'recruiting'
		WHEN 'Em andamento' THEN 'ongoing'
		WHEN 'Finalizada' THEN 'finished'
		ELSE 'building'
	END
)::"public"."campaign_status";--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "status" SET DEFAULT 'building'::"public"."campaign_status";--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "cover_drawing" smallint;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "cover_tone" smallint;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "cover_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "content_warnings" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_cover_asset_id_assets_id_fk" FOREIGN KEY ("cover_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;
