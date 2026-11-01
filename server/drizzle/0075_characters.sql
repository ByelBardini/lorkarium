CREATE TABLE "character_bars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"current" integer NOT NULL,
	"max" integer NOT NULL,
	"color" "bar_color" NOT NULL,
	"visibility" "bar_visibility" NOT NULL,
	"display" "bar_display" DEFAULT 'number' NOT NULL,
	CONSTRAINT "character_bars_character_id_position_unique" UNIQUE("character_id","position")
);
--> statement-breakpoint
CREATE TABLE "character_controllers" (
	"character_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "character_controllers_character_id_user_id_pk" PRIMARY KEY("character_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"initials" text NOT NULL,
	"side" "token_side" NOT NULL,
	"image_asset_id" uuid,
	"frame" "token_frame" DEFAULT 'square' NOT NULL,
	"defeated" boolean DEFAULT false NOT NULL,
	"aura_kind" "token_aura_kind",
	"aura_radius" numeric(6, 2),
	"aura_color" "drawing_color",
	"aura_effect" "aura_effect",
	"aura_image_asset_id" uuid,
	"aura_opacity" smallint,
	"aura_image_shape" "token_frame",
	"width" double precision DEFAULT 1 NOT NULL,
	"height" double precision DEFAULT 1 NOT NULL,
	"armor_class" smallint,
	"difficulty_class" smallint,
	"note_one" text,
	"note_two" text,
	"main_sheet_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_campaign_id_id_unique" UNIQUE("campaign_id","id"),
	CONSTRAINT "characters_name_length" CHECK (char_length("characters"."name") BETWEEN 1 AND 60),
	CONSTRAINT "characters_note_one_length" CHECK (char_length("characters"."note_one") <= 80),
	CONSTRAINT "characters_note_two_length" CHECK (char_length("characters"."note_two") <= 80),
	CONSTRAINT "characters_armor_class_range" CHECK ("characters"."armor_class" BETWEEN 0 AND 999),
	CONSTRAINT "characters_difficulty_class_range" CHECK ("characters"."difficulty_class" BETWEEN 0 AND 999),
	CONSTRAINT "characters_aura_shape" CHECK (("characters"."aura_kind" IS NULL AND "characters"."aura_radius" IS NULL AND "characters"."aura_color" IS NULL AND "characters"."aura_effect" IS NULL AND "characters"."aura_image_asset_id" IS NULL AND "characters"."aura_opacity" IS NULL AND "characters"."aura_image_shape" IS NULL) OR ("characters"."aura_kind" IS NOT NULL AND "characters"."aura_radius" IS NOT NULL AND "characters"."aura_opacity" IS NOT NULL AND "characters"."aura_radius" BETWEEN 0 AND 20 AND "characters"."aura_opacity" BETWEEN 10 AND 100)),
	CONSTRAINT "characters_aura_fields" CHECK (("characters"."aura_kind" IS DISTINCT FROM 'color' OR "characters"."aura_color" IS NOT NULL) AND (("characters"."aura_effect" IS NOT NULL) = ("characters"."aura_kind" IS NOT DISTINCT FROM 'effect')) AND ("characters"."aura_color" IS NULL OR "characters"."aura_kind" IS NOT DISTINCT FROM 'color' OR "characters"."aura_kind" IS NOT DISTINCT FROM 'effect') AND ("characters"."aura_image_asset_id" IS NULL OR "characters"."aura_kind" IS NOT DISTINCT FROM 'image') AND (("characters"."aura_image_shape" IS NOT NULL) = ("characters"."aura_kind" IS NOT DISTINCT FROM 'image'))),
	CONSTRAINT "characters_size_half_cells" CHECK ("characters"."width" BETWEEN 0.5 AND 10 AND "characters"."height" BETWEEN 0.5 AND 10 AND ("characters"."width" * 2) = floor("characters"."width" * 2) AND ("characters"."height" * 2) = floor("characters"."height" * 2))
);
--> statement-breakpoint
ALTER TABLE "active_conditions" ALTER COLUMN "token_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "active_conditions" ADD COLUMN "character_id" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "characters_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "token_sheets" ADD COLUMN "character_id" uuid;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "character_id" uuid;--> statement-breakpoint
ALTER TABLE "character_bars" ADD CONSTRAINT "character_bars_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_controllers" ADD CONSTRAINT "character_controllers_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_controllers" ADD CONSTRAINT "character_controllers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_image_asset_id_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_aura_image_asset_id_assets_id_fk" FOREIGN KEY ("aura_image_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_main_sheet_fk" FOREIGN KEY ("campaign_id","main_sheet_id") REFERENCES "public"."token_sheets"("campaign_id","id") ON DELETE SET NULL ("main_sheet_id") ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "characters_campaign_user_unique" ON "characters" USING btree ("campaign_id","user_id") WHERE "characters"."user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "active_conditions" ADD CONSTRAINT "active_conditions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_sheets" ADD CONSTRAINT "token_sheets_character_fk" FOREIGN KEY ("campaign_id","character_id") REFERENCES "public"."characters"("campaign_id","id") ON DELETE SET NULL ("character_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "token_sheets_character_idx" ON "token_sheets" USING btree ("campaign_id","character_id");--> statement-breakpoint
ALTER TABLE "active_conditions" ADD CONSTRAINT "active_conditions_character_condition_unique" UNIQUE("character_id","condition_id");--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_scene_id_character_id_unique" UNIQUE("scene_id","character_id");--> statement-breakpoint
ALTER TABLE "active_conditions" ADD CONSTRAINT "active_conditions_one_holder" CHECK (("active_conditions"."token_id" IS NULL) <> ("active_conditions"."character_id" IS NULL));--> statement-breakpoint
ALTER TABLE "token_sheets" ADD CONSTRAINT "token_sheets_one_holder" CHECK ("token_sheets"."token_id" IS NULL OR "token_sheets"."character_id" IS NULL);--> statement-breakpoint
-- Data, by hand (docs/context/characters.md, Tabelas e migração): one character per anchor of a
-- cast (with the card of its member, if any; a member who left gives one without a player), per
-- card without an anchor, and per player with neither. The app still reads the old model.
CREATE TEMP TABLE "character_seeds" (
	"character_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"campaign_id" uuid NOT NULL,
	"user_id" uuid,
	"anchor_token_id" uuid
) ON COMMIT DROP;--> statement-breakpoint
INSERT INTO "character_seeds" ("campaign_id", "user_id", "anchor_token_id")
SELECT s."campaign_id", mc."user_id", a."id"
FROM "tokens" a
JOIN "scenes" s ON s."id" = a."scene_id" AND s."kind" = 'cast'
LEFT JOIN "member_cards" mc ON mc."anchor_token_id" = a."id";--> statement-breakpoint
INSERT INTO "character_seeds" ("campaign_id", "user_id")
SELECT mc."campaign_id", mc."user_id"
FROM "member_cards" mc
WHERE NOT EXISTS (
	SELECT 1 FROM "character_seeds" cs WHERE cs."campaign_id" = mc."campaign_id" AND cs."user_id" = mc."user_id"
);--> statement-breakpoint
-- A master in juggernaut mode who was a player goes back to being one.
INSERT INTO "character_seeds" ("campaign_id", "user_id")
SELECT m."campaign_id", m."user_id"
FROM "campaign_members" m
WHERE (m."role" = 'player' OR m."role_before_juggernaut" = 'player')
	AND NOT EXISTS (
		SELECT 1 FROM "character_seeds" cs WHERE cs."campaign_id" = m."campaign_id" AND cs."user_id" = m."user_id"
	);--> statement-breakpoint
-- The name: the card's, else the anchor's, else the nickname. The look, the aura and the size
-- come from the anchor; without one, the initials follow game-core `initialsOf` (the first
-- letters of the first two words that are not connectives, or the first two of a single word).
INSERT INTO "characters" (
	"id", "campaign_id", "user_id", "name", "initials", "side", "image_asset_id", "frame", "defeated",
	"aura_kind", "aura_radius", "aura_color", "aura_effect", "aura_image_asset_id", "aura_opacity",
	"aura_image_shape", "width", "height", "armor_class", "difficulty_class", "note_one", "note_two"
)
SELECT cs."character_id", cs."campaign_id", cs."user_id", named."name",
	COALESCE(a."initials", initials."value"), COALESCE(a."side", 'ally'), a."image_asset_id",
	COALESCE(a."frame", 'square'), COALESCE(a."defeated", false),
	a."aura_kind", a."aura_radius", a."aura_color", a."aura_effect", a."aura_image_asset_id",
	a."aura_opacity", a."aura_image_shape", COALESCE(a."width", 1), COALESCE(a."height", 1),
	mc."armor_class", mc."difficulty_class", mc."note_one", mc."note_two"
FROM "character_seeds" cs
LEFT JOIN "tokens" a ON a."id" = cs."anchor_token_id"
LEFT JOIN "member_cards" mc ON mc."campaign_id" = cs."campaign_id" AND mc."user_id" = cs."user_id"
LEFT JOIN "users" u ON u."id" = cs."user_id"
CROSS JOIN LATERAL (
	SELECT COALESCE(NULLIF(btrim(mc."character_name"), ''), a."name", u."name") AS "name"
) named
CROSS JOIN LATERAL (
	SELECT upper(CASE
		WHEN cardinality(split."words") >= 2 THEN left(split."words"[1], 1) || left(split."words"[2], 1)
		WHEN cardinality(split."words") = 1 THEN left(split."words"[1], 2)
		ELSE left(btrim(named."name"), 2)
	END) AS "value"
	FROM (
		SELECT ARRAY(
			SELECT w."word"
			FROM regexp_split_to_table(btrim(named."name"), '\s+') WITH ORDINALITY AS w("word", "n")
			WHERE w."word" <> '' AND lower(w."word") NOT IN ('de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o')
			ORDER BY w."n"
		) AS "words"
	) split
) initials;--> statement-breakpoint
INSERT INTO "character_bars" ("character_id", "position", "label", "current", "max", "color", "visibility", "display")
SELECT cs."character_id", b."position", b."label", b."current", b."max", b."color", b."visibility", b."display"
FROM "character_seeds" cs
JOIN "token_bars" b ON b."token_id" = cs."anchor_token_id";--> statement-breakpoint
INSERT INTO "character_controllers" ("character_id", "user_id")
SELECT cs."character_id", c."user_id"
FROM "character_seeds" cs
JOIN "token_controllers" c ON c."token_id" = cs."anchor_token_id";--> statement-breakpoint
INSERT INTO "character_controllers" ("character_id", "user_id")
SELECT cs."character_id", cs."user_id"
FROM "character_seeds" cs
WHERE cs."anchor_token_id" IS NULL AND cs."user_id" IS NOT NULL;--> statement-breakpoint
UPDATE "active_conditions" ac
SET "character_id" = cs."character_id", "token_id" = NULL
FROM "character_seeds" cs
WHERE ac."token_id" = cs."anchor_token_id";--> statement-breakpoint
UPDATE "tokens" t
SET "character_id" = cs."character_id"
FROM "character_seeds" cs
WHERE t."anchor_token_id" = cs."anchor_token_id";--> statement-breakpoint
-- The sheets go only after the characters exist (token_sheets_character_fk), and the main sheet,
-- the oldest, only after the sheets point at their character (characters_main_sheet_fk).
UPDATE "token_sheets" ts
SET "character_id" = cs."character_id", "token_id" = NULL
FROM "character_seeds" cs
WHERE ts."token_id" = cs."anchor_token_id";--> statement-breakpoint
UPDATE "characters" c
SET "main_sheet_id" = (
	SELECT ts."id" FROM "token_sheets" ts
	WHERE ts."campaign_id" = c."campaign_id" AND ts."character_id" = c."id"
	ORDER BY ts."created_at", ts."id"
	LIMIT 1
);--> statement-breakpoint
-- Forms stay per token: each linked token trades its own unused forms for a copy of the anchor's
-- (new ids), and shows the copy of the form the anchor showed.
DELETE FROM "token_forms" f
USING "tokens" t
WHERE f."token_id" = t."id" AND t."character_id" IS NOT NULL;--> statement-breakpoint
INSERT INTO "token_forms" ("token_id", "position", "name", "image_asset_id", "width", "height", "frame")
SELECT t."id", f."position", f."name", f."image_asset_id", f."width", f."height", f."frame"
FROM "tokens" t
JOIN "token_forms" f ON f."token_id" = t."anchor_token_id"
WHERE t."character_id" IS NOT NULL;--> statement-breakpoint
UPDATE "tokens" t
SET "active_form_id" = (
	SELECT own."id"
	FROM "tokens" a
	JOIN "token_forms" shown ON shown."id" = a."active_form_id"
	JOIN "token_forms" own ON own."token_id" = t."id" AND own."position" = shown."position"
	WHERE a."id" = t."anchor_token_id"
)
WHERE t."character_id" IS NOT NULL;
