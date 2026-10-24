CREATE TYPE "public"."member_color" AS ENUM('gold', 'steel', 'ember', 'moss', 'violet', 'rose', 'teal', 'bone');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "color" "member_color";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_changed_at" timestamp with time zone;--> statement-breakpoint
-- The @ of the accounts that already exist, by the rule of usernameFromEmail (username.bo.ts): the
-- local part before "+", lowercased, only a-z 0-9 . _; empty → "jogador", under 3 → "<x>.rpg"; up
-- to 20, and the repeated ones (oldest first) get 2, 3… with the stem cut to fit the 20.
WITH stems AS (
  SELECT id, created_at,
         regexp_replace(lower(split_part(split_part(email, '@', 1), '+', 1)), '[^a-z0-9._]', '', 'g') AS raw
  FROM users
), shaped AS (
  SELECT id, created_at,
         CASE WHEN raw = '' THEN 'jogador'
              WHEN char_length(raw) < 3 THEN raw || '.rpg'
              ELSE raw END AS stem
  FROM stems
), ranked AS (
  SELECT id, stem, row_number() OVER (PARTITION BY left(stem, 20) ORDER BY created_at, id) AS n
  FROM shaped
)
UPDATE users SET username = CASE
    WHEN ranked.n = 1 THEN left(ranked.stem, 20)
    ELSE left(ranked.stem, 20 - char_length(ranked.n::text)) || ranked.n::text
  END
FROM ranked WHERE users.id = ranked.id;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_bio_length" CHECK (char_length("users"."bio") <= 190);
