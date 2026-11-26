-- The 11 initial conditions move to Game-icons, but only where the icon is still the default of
-- 0009: an icon the master changed stays. Same name match as 0009 (lower(name)).
UPDATE "condition_definitions" SET "icon" = v.new_icon
FROM (VALUES
  ('abençoado', 'sparkles', 'game-icons:spiked-halo'),
  ('concentrando', 'crosshair', 'game-icons:meditation'),
  ('invisível', 'ghost', 'game-icons:invisible'),
  ('agarrado', 'hand', 'game-icons:grab'),
  ('amedrontado', 'angry', 'game-icons:screaming'),
  ('atordoado', 'zap', 'game-icons:knocked-out-stars'),
  ('caído', 'arrow-down-to-line', 'game-icons:falling'),
  ('cego', 'eye-off', 'game-icons:blindfold'),
  ('envenenado', 'flask-conical', 'game-icons:poison-bottle'),
  ('imobilizado', 'link', 'game-icons:manacles'),
  ('paralisado', 'lock', 'game-icons:frozen-body')
) AS v(name, old_icon, new_icon)
WHERE lower("condition_definitions"."name") = v.name
  AND "condition_definitions"."icon" = v.old_icon;
