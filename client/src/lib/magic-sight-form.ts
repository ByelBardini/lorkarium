import { parseRangeFields, rangeFieldsOf, type SceneDistance } from './range-form';

/** "Visão mágica" as typed: the switch, how far ("Até") in the unit of the scene, and whether the
 *  token already had it (switching off then sends `null`). */
export type MagicSightFields = Readonly<{ on: boolean; reach: string; saved: boolean }>;

/** The fields → what to send: the range in cells to the hundredth, `null` (off, had it) or
 *  `undefined` (off, never had it: nothing is sent); or the error of the field. */
export type MagicSightResult =
  | Readonly<{ ok: true; magicSight: number | null | undefined }>
  | Readonly<{ ok: false; error: string }>;

const MAGIC_TEXTS = { missingBright: 'Informe o alcance da visão mágica.' };

/** A token without magic sight: off, nothing typed. */
export const NO_MAGIC_SIGHT_FIELDS: MagicSightFields = { on: false, reach: '', saved: false };

/** The magic sight of a token (cells, or `null`) as the fields show it, in the unit of the scene.
 *
 *  Example: `magicSightFieldsOf(4, { cellDistance: 1.5, cellUnit: 'm' }) // { on: true, reach: '6', saved: true }` */
export function magicSightFieldsOf(
  cells: number | null,
  distance: SceneDistance,
): MagicSightFields {
  if (cells === null) return NO_MAGIC_SIGHT_FIELDS;
  const { bright } = rangeFieldsOf({ bright: cells, dim: 0 }, distance);
  return { on: true, reach: bright, saved: true };
}

/** The fields → the magic sight to send, with the limits of a reach (0 to 100 cells, told in the
 *  unit of the scene: "De 0 a 150 m.").
 *
 *  Example: `parseMagicSightFields({ on: true, reach: '9', saved: false }, scene) // { ok: true, magicSight: 6 }` */
export function parseMagicSightFields(
  fields: MagicSightFields,
  distance: SceneDistance,
): MagicSightResult {
  const range = { on: fields.on, bright: fields.reach, dim: '', saved: fields.saved };
  const parsed = parseRangeFields(range, distance, MAGIC_TEXTS);
  if (!parsed.ok) return { ok: false, error: parsed.errors.bright ?? MAGIC_TEXTS.missingBright };
  const magicSight = parsed.range === undefined ? undefined : (parsed.range?.bright ?? null);
  return { ok: true, magicSight };
}
