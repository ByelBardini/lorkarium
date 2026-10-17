ALTER TABLE "condition_definitions" ADD COLUMN "icon" text DEFAULT 'circle-dot' NOT NULL;--> statement-breakpoint
UPDATE "condition_definitions" SET "icon" = v.icon
FROM (VALUES
  ('abençoado', 'sparkles'),
  ('concentrando', 'crosshair'),
  ('invisível', 'ghost'),
  ('agarrado', 'hand'),
  ('amedrontado', 'angry'),
  ('atordoado', 'zap'),
  ('caído', 'arrow-down-to-line'),
  ('cego', 'eye-off'),
  ('envenenado', 'flask-conical'),
  ('imobilizado', 'link'),
  ('paralisado', 'lock')
) AS v(name, icon)
WHERE lower("condition_definitions"."name") = v.name;
