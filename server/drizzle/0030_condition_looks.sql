-- The migrator runs every pending migration in one transaction, and Postgres refuses a value added
-- by ALTER TYPE ... ADD VALUE in the same transaction: the tone type is rebuilt instead.
CREATE TYPE "public"."condition_tone_v2" AS ENUM('benefit', 'harm', 'incapacitating');--> statement-breakpoint
ALTER TABLE "condition_definitions" ALTER COLUMN "tone" SET DATA TYPE "public"."condition_tone_v2" USING "tone"::text::"public"."condition_tone_v2";--> statement-breakpoint
DROP TYPE "public"."condition_tone";--> statement-breakpoint
ALTER TYPE "public"."condition_tone_v2" RENAME TO "condition_tone";--> statement-breakpoint
CREATE TYPE "public"."condition_look" AS ENUM('unconscious', 'invisible');--> statement-breakpoint
ALTER TABLE "condition_definitions" ADD COLUMN "look" "condition_look";--> statement-breakpoint
-- The old tables get the same marks as condition-rules.bo.ts, by name; the icon decides nothing.
UPDATE "condition_definitions" SET "tone" = 'incapacitating'
WHERE lower("condition_definitions"."name") IN ('paralisado', 'atordoado');--> statement-breakpoint
UPDATE "condition_definitions" SET "look" = v.look::"condition_look"
FROM (VALUES
  ('invisível', 'invisible'),
  ('inconsciente', 'unconscious')
) AS v(name, look)
WHERE lower("condition_definitions"."name") = v.name;
