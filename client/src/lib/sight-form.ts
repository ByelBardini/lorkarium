import type { SightDto } from '@lorkarium/contracts';
import {
  parseRangeFields,
  rangeFieldsOf,
  type RangeFieldErrors,
  type SceneDistance,
} from './range-form';

export type { SceneDistance } from './range-form';

/** The "Visão" section as typed, in the unit of the scene ("18" m): text until saved. `saved` says
 *  the token already sees, so turning "Enxerga" off clears it (`null`) instead of leaving it. */
export type SightFields = Readonly<{ sees: boolean; bright: string; dim: string; saved: boolean }>;

export type SightFieldErrors = RangeFieldErrors;

/** `sight: undefined` keeps what the token has (it never saw and still does not). */
export type SightFieldsResult =
  | Readonly<{ ok: true; sight: SightDto | null | undefined }>
  | Readonly<{ ok: false; errors: SightFieldErrors }>;

export const MISSING_BRIGHT = 'Informe a visão plena.';

/** The section of a token as it sees now, in the scene's unit.
 *
 *  Example: `sightFieldsOf({ bright: 12, dim: 4 }, { cellDistance: 1.5, cellUnit: 'm' })` → `"18"` and `"6"` */
export function sightFieldsOf(sight: SightDto | null, distance: SceneDistance): SightFields {
  const { on, ...typed } = rangeFieldsOf(sight, distance);
  return { sees: on, ...typed };
}

/** The section → the sight to send, in cells to the hundredth (the `range-form` rule with the
 *  texts of sight).
 *
 *  Example: `parseSightFields({ sees: true, bright: '18', dim: '6', saved: false }, scene)` → `{ ok: true, sight: { bright: 12, dim: 4 } }` */
export function parseSightFields(fields: SightFields, distance: SceneDistance): SightFieldsResult {
  const { sees, ...typed } = fields;
  const parsed = parseRangeFields({ on: sees, ...typed }, distance, {
    missingBright: MISSING_BRIGHT,
  });
  return parsed.ok ? { ok: true, sight: parsed.range } : parsed;
}
