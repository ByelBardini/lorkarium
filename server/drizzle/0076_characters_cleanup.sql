-- Guard, by hand (docs/context/characters.md, Limpeza): 0075 gave every token linked to an anchor
-- its character and moved every sheet and condition of an anchor to it. Anything left on the old
-- model would be lost below, so the migration stops citing it instead.
DO $$
DECLARE
	stray record;
BEGIN
	SELECT t."id", t."anchor_token_id" INTO stray
	FROM "tokens" t
	WHERE t."anchor_token_id" IS NOT NULL AND t."character_id" IS NULL
	LIMIT 1;
	IF FOUND THEN
		RAISE EXCEPTION 'token % has anchor_token_id % but no character_id; expected 0075 to link it to the character of its anchor', stray."id", stray."anchor_token_id";
	END IF;
	SELECT ts."id", ts."token_id" INTO stray
	FROM "token_sheets" ts
	JOIN "tokens" a ON a."id" = ts."token_id"
	JOIN "scenes" s ON s."id" = a."scene_id" AND s."kind" = 'cast'
	LIMIT 1;
	IF FOUND THEN
		RAISE EXCEPTION 'sheet % is still held by anchor %; expected 0075 to hand it to the character', stray."id", stray."token_id";
	END IF;
	SELECT ac."id", ac."token_id" INTO stray
	FROM "active_conditions" ac
	JOIN "tokens" a ON a."id" = ac."token_id"
	JOIN "scenes" s ON s."id" = a."scene_id" AND s."kind" = 'cast'
	LIMIT 1;
	IF FOUND THEN
		RAISE EXCEPTION 'condition % is still held by anchor %; expected 0075 to move it to the character', stray."id", stray."token_id";
	END IF;
END $$;--> statement-breakpoint
DROP TABLE "main_tokens" CASCADE;--> statement-breakpoint
DROP TABLE "member_cards" CASCADE;--> statement-breakpoint
ALTER TABLE "tokens" DROP CONSTRAINT "tokens_scene_id_anchor_token_id_unique";--> statement-breakpoint
ALTER TABLE "tokens" DROP CONSTRAINT "tokens_anchor_token_id_tokens_id_fk";--> statement-breakpoint
ALTER TABLE "tokens" DROP COLUMN "anchor_token_id";--> statement-breakpoint
-- The casts go with what they hold: the anchors and, by cascade, their bars, controllers and forms.
DELETE FROM "scenes" WHERE "kind" = 'cast';--> statement-breakpoint
DROP INDEX "scenes_one_cast_per_campaign";--> statement-breakpoint
ALTER TABLE "scenes" DROP COLUMN "kind";--> statement-breakpoint
DROP TYPE "public"."scene_kind";
