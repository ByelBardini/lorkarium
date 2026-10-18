import { SIGHT_RANGE_MAX, type SightDto } from '@lorkarium/contracts';
import { cellsText } from './cells-text';
import { toHundredth } from './drawing-geometry';

/** The "Visão" section as typed, in the unit of the scene ("18" m): text until saved. `saved` says
 *  the token already sees, so turning "Enxerga" off clears it (`null`) instead of leaving it. */
export type SightFields = Readonly<{ sees: boolean; bright: string; dim: string; saved: boolean }>;

/** How long a cell is in the scene: the forms speak the scene's unit, the server keeps cells. */
export type SceneDistance = Readonly<{ cellDistance: number; cellUnit: string }>;

export type SightFieldErrors = Readonly<{ bright?: string; dim?: string }>;

/** `sight: undefined` keeps what the token has (it never saw and still does not). */
export type SightFieldsResult =
  | Readonly<{ ok: true; sight: SightDto | null | undefined }>
  | Readonly<{ ok: false; errors: SightFieldErrors }>;

export const MISSING_BRIGHT = 'Informe a visão plena.';

/** The section of a token as it sees now, in the scene's unit.
 *
 *  Example: `sightFieldsOf({ bright: 12, dim: 4 }, { cellDistance: 1.5, cellUnit: 'm' })` → `"18"` and `"6"` */
export function sightFieldsOf(sight: SightDto | null, distance: SceneDistance): SightFields {
  if (!sight) return { sees: false, bright: '', dim: '', saved: false };
  const shown = (cells: number): string => cellsText(toHundredth(cells * distance.cellDistance));
  return { sees: true, bright: shown(sight.bright), dim: shown(sight.dim), saved: true };
}

/** The section → the sight to send, in cells to the hundredth: each field from 0 to 100 cells
 *  (the range told in the scene's unit), an empty dim is none, an empty bright is missing.
 *
 *  Example: `parseSightFields({ sees: true, bright: '18', dim: '6', saved: false }, scene)` → `{ ok: true, sight: { bright: 12, dim: 4 } }` */
export function parseSightFields(fields: SightFields, distance: SceneDistance): SightFieldsResult {
  if (!fields.sees) return { ok: true, sight: fields.saved ? null : undefined };
  if (fields.bright.trim() === '') return { ok: false, errors: { bright: MISSING_BRIGHT } };
  const bright = cellsIn(fields.bright, distance);
  const dim = fields.dim.trim() === '' ? 0 : cellsIn(fields.dim, distance);
  const range = rangeText(distance);
  const errors: SightFieldErrors = {
    ...(inRange(bright) ? {} : { bright: range }),
    ...(inRange(dim) ? {} : { dim: range }),
  };
  if (errors.bright || errors.dim) return { ok: false, errors };
  return { ok: true, sight: { bright, dim } };
}

/** What a typed distance is in cells, under the field ("= 12 casas"); nothing when unreadable.
 *
 *  Example: `sightCellsHint('18', { cellDistance: 1.5, cellUnit: 'm' }) // '= 12 casas'` */
export function sightCellsHint(typed: string, distance: SceneDistance): string | null {
  const cells = cellsIn(typed, distance);
  if (!Number.isFinite(cells)) return null;
  return `= ${cellsText(cells)} ${cells === 1 ? 'casa' : 'casas'}`;
}

// "1,5" and "1.5" alike; the typographic minus too, so "−1" is refused as out of range.
function cellsIn(typed: string, distance: SceneDistance): number {
  const text = typed.trim().replace('−', '-').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(text)) return Number.NaN;
  return toHundredth(Number(text) / distance.cellDistance);
}

function inRange(cells: number): boolean {
  return Number.isFinite(cells) && cells >= 0 && cells <= SIGHT_RANGE_MAX;
}

function rangeText({ cellDistance, cellUnit }: SceneDistance): string {
  return `De 0 a ${cellsText(toHundredth(SIGHT_RANGE_MAX * cellDistance))} ${cellUnit}.`;
}
