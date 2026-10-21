ALTER TABLE "tokens" ADD COLUMN "sight_angle" smallint DEFAULT 360 NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "light_angle" smallint DEFAULT 360 NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_sight_angle" CHECK ("tokens"."sight_angle" BETWEEN 1 AND 360);--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_light_angle" CHECK ("tokens"."light_angle" BETWEEN 1 AND 360);