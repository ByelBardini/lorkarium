ALTER TABLE "lights" ADD COLUMN "facing" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lights" ADD COLUMN "angle" smallint DEFAULT 360 NOT NULL;--> statement-breakpoint
ALTER TABLE "lights" ADD CONSTRAINT "lights_facing" CHECK ("lights"."facing" BETWEEN 0 AND 359);--> statement-breakpoint
ALTER TABLE "lights" ADD CONSTRAINT "lights_angle" CHECK ("lights"."angle" BETWEEN 1 AND 360);