ALTER TABLE "token_forms" ALTER COLUMN "token_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "token_forms" ADD COLUMN "character_id" uuid;--> statement-breakpoint
ALTER TABLE "token_forms" ADD CONSTRAINT "token_forms_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_forms" ADD CONSTRAINT "token_forms_character_id_position_unique" UNIQUE("character_id","position");--> statement-breakpoint
ALTER TABLE "token_forms" ADD CONSTRAINT "token_forms_one_holder" CHECK (num_nonnulls("token_forms"."token_id", "token_forms"."character_id") = 1);
--> statement-breakpoint
-- The forms of the tokens already linked move to their character: the same form in several grids
-- (the 0075 copied them) becomes one, the first token's order first, 8 at most.
INSERT INTO "token_forms" ("character_id", "position", "name", "image_asset_id", "width", "height", "frame")
SELECT "character_id", "place" - 1, "name", "image_asset_id", "width", "height", "frame"
FROM (
	SELECT "character_id", "name", "image_asset_id", "width", "height", "frame",
		row_number() OVER (PARTITION BY "character_id" ORDER BY "first_seen") AS "place"
	FROM (
		SELECT t."character_id", f."name", f."image_asset_id", f."width", f."height", f."frame",
			min(ARRAY[extract(epoch FROM t."created_at")::numeric, f."position"::numeric]) AS "first_seen"
		FROM "token_forms" f
		JOIN "tokens" t ON t."id" = f."token_id"
		WHERE t."character_id" IS NOT NULL
		GROUP BY t."character_id", f."name", f."image_asset_id", f."width", f."height", f."frame"
	) AS "alike"
) AS "placed"
WHERE "place" <= 8;
--> statement-breakpoint
-- Each token keeps showing the form it showed, now its character's; one left out of the 8 shows none.
UPDATE "tokens" t
SET "active_form_id" = (
	SELECT shared."id"
	FROM "token_forms" shown
	JOIN "token_forms" shared ON shared."character_id" = t."character_id"
		AND shared."name" = shown."name"
		AND shared."image_asset_id" IS NOT DISTINCT FROM shown."image_asset_id"
		AND shared."width" = shown."width"
		AND shared."height" = shown."height"
		AND shared."frame" = shown."frame"
	WHERE shown."id" = t."active_form_id"
)
WHERE t."character_id" IS NOT NULL AND t."active_form_id" IS NOT NULL;
--> statement-breakpoint
DELETE FROM "token_forms" f
USING "tokens" t
WHERE f."token_id" = t."id" AND t."character_id" IS NOT NULL;
