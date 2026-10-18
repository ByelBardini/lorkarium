ALTER TABLE "tokens" ALTER COLUMN "col" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "tokens" ALTER COLUMN "row" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "width" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "height" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
-- A token was a size × size square: both sides keep that size.
UPDATE "tokens" SET "width" = "size", "height" = "size";--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_box_half_cells" CHECK ("tokens"."col" >= 0 AND "tokens"."row" >= 0 AND "tokens"."width" BETWEEN 0.5 AND 10 AND "tokens"."height" BETWEEN 0.5 AND 10 AND ("tokens"."col" * 2) = floor("tokens"."col" * 2) AND ("tokens"."row" * 2) = floor("tokens"."row" * 2) AND ("tokens"."width" * 2) = floor("tokens"."width" * 2) AND ("tokens"."height" * 2) = floor("tokens"."height" * 2));