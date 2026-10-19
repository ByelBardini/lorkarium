import { REACH_MAX } from '@lorkarium/contracts';
import { cellsText } from './cells-text';
import { toHundredth } from './drawing-geometry';

/** How long a cell is in the scene: the forms speak the scene's unit, the server keeps cells. */
export type SceneDistance = Readonly<{ cellDistance: number; cellUnit: string }>;

/** A bright + dim range as typed, in the unit of the scene ("6" m): text until saved. `on` is the
 *  switch of the section ("Enxerga no escuro", "Emite luz"); `saved` says the token already had a
 *  range, so switching off clears it (`null`) instead of leaving it. */
export type RangeFields = Readonly<{ on: boolean; bright: string; dim: string; saved: boolean }>;

export type RangeInCells = Readonly<{ bright: number; dim: number }>;
export type RangeFieldErrors = Readonly<{ bright?: string; dim?: string }>;

/** What the section says when the bright field is empty ("Informe a luz plena."). */
export type RangeTexts = Readonly<{ missingBright: string }>;

/** `range: undefined` keeps what the token has (it never had one and still does not). */
export type RangeFieldsResult =
  | Readonly<{ ok: true; range: RangeInCells | null | undefined }>
  | Readonly<{ ok: false; errors: RangeFieldErrors }>;

/** The fields of a saved range, in the scene's unit.
 *
 *  Example: `rangeFieldsOf({ bright: 4, dim: 4 }, { cellDistance: 1.5, cellUnit: 'm' })` → `"6"` and `"6"` */
export function rangeFieldsOf(range: RangeInCells | null, distance: SceneDistance): RangeFields {
  if (!range) return { on: false, bright: '', dim: '', saved: false };
  const shown = (cells: number): string => cellsText(toHundredth(cells * distance.cellDistance));
  return { on: true, bright: shown(range.bright), dim: shown(range.dim), saved: true };
}

/** The fields → the range to send, in cells to the hundredth: each side from 0 to 100 cells (the
 *  limit told in the scene's unit), an empty dim is none, an empty bright is missing.
 *
 *  Example: `parseRangeFields({ on: true, bright: '6', dim: '6', saved: false }, scene, texts)` → `{ ok: true, range: { bright: 4, dim: 4 } }` */
export function parseRangeFields(
  fields: RangeFields,
  distance: SceneDistance,
  texts: RangeTexts,
): RangeFieldsResult {
  if (!fields.on) return { ok: true, range: fields.saved ? null : undefined };
  if (fields.bright.trim() === '') return { ok: false, errors: { bright: texts.missingBright } };
  const bright = cellsIn(fields.bright, distance);
  const dim = fields.dim.trim() === '' ? 0 : cellsIn(fields.dim, distance);
  const limit = limitText(distance);
  const errors: RangeFieldErrors = {
    ...(withinReach(bright) ? {} : { bright: limit }),
    ...(withinReach(dim) ? {} : { dim: limit }),
  };
  if (errors.bright || errors.dim) return { ok: false, errors };
  return { ok: true, range: { bright, dim } };
}

/** What a typed distance is in cells, under the field ("= 4 casas"); nothing when unreadable.
 *
 *  Example: `rangeCellsHint('6', { cellDistance: 1.5, cellUnit: 'm' }) // '= 4 casas'` */
export function rangeCellsHint(typed: string, distance: SceneDistance): string | null {
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

function withinReach(cells: number): boolean {
  return Number.isFinite(cells) && cells >= 0 && cells <= REACH_MAX;
}

function limitText({ cellDistance, cellUnit }: SceneDistance): string {
  return `De 0 a ${cellsText(toHundredth(REACH_MAX * cellDistance))} ${cellUnit}.`;
}
