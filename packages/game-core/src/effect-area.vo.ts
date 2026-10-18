import { facing } from './facing.vo';
import type { SceneSize } from './grid';
import { TOKEN_SIZE_MAX, TOKEN_SIZE_MIN } from './token-size.vo';

/** The longest reach or side of an area, in cells: the widest scene (`SCENE_CELLS_MAX`). */
export const EFFECT_AREA_REACH_MAX = 100;
/** The shortest reach of a smooth shape, in cells. */
export const SMOOTH_REACH_MIN = 0.5;

type Colored = Readonly<{ color: string }>;
type Origin = Readonly<{ x: number; y: number }>;

/** The box of whole cells a square paints, from its top-left grid intersection. */
export type SquareArea = Colored &
  Origin &
  Readonly<{ kind: 'square'; width: number; height: number }>;
/** A circle around its center: on an intersection (`circle`) or anywhere (`smooth_circle`). */
export type RoundArea = Colored &
  Origin &
  Readonly<{ kind: 'circle' | 'smooth_circle'; reach: number }>;
/** A shape that points somewhere: semicircles, cones and the line. */
export type AimedArea = Colored &
  Origin &
  Readonly<{ kind: AimedAreaKind; reach: number; facing: number }>;
/** The cells around a token's footprint (`x, y, width, height`, in half cells), up to `reach`. */
export type EmanationArea = Colored &
  Origin &
  Readonly<{ kind: 'emanation'; width: number; height: number; reach: number }>;

export type AimedAreaKind =
  'semicircle' | 'orthogonal_cone' | 'diagonal_cone' | 'line' | 'smooth_semicircle';

/** An area of effect (a spell template): a grid shape paints whole cells, a smooth one is a free outline. */
export type EffectArea = SquareArea | RoundArea | AimedArea | EmanationArea;
export type EffectAreaKind = EffectArea['kind'];

/** Whether the shape is a free outline that paints no cell. */
export function isSmoothArea(area: EffectArea): boolean {
  return area.kind === 'smooth_circle' || area.kind === 'smooth_semicircle';
}

/** Validates an area by its kind (origin snapped where the shape is born, reach, sides, facing)
 *  and returns it frozen; a mismatch throws a `RangeError` citing the value and the expected shape.
 *
 *  Example: `effectArea({ kind: 'circle', x: 5, y: 5, reach: 3, color: 'ember' })` */
export function effectArea<T extends EffectArea>(area: T): T {
  if ('facing' in area) assertFacing(area);
  assertOrigin(area);
  if ('reach' in area) assertReach(area);
  if (area.kind === 'square') assertSides(area, isWholeCells, 'whole cells from 1 to 100');
  if (area.kind === 'emanation') assertSides(area, isTokenSide, TOKEN_SIDE_TEXT);
  return Object.freeze({ ...area });
}

/** Whether the area's origin lies inside the scene, edges included; the rest of the shape is
 *  clipped, so a square spilling past the border still fits.
 *
 *  Example: `effectAreaOriginFits({ widthCells: 20, heightCells: 12 }, circleAt(20, 12))` → `true` */
export function effectAreaOriginFits(scene: SceneSize, area: EffectArea): boolean {
  return (
    hundredths(area.x) <= hundredths(scene.widthCells) &&
    hundredths(area.y) <= hundredths(scene.heightCells)
  );
}

const TOKEN_SIDE_TEXT = `a multiple of 0.5 from ${TOKEN_SIZE_MIN} to ${TOKEN_SIZE_MAX}`;
const SQUARE_FACINGS = [0, 90, 180, 270];
const DIAGONAL_FACINGS = [45, 135, 225, 315];

function assertFacing(area: AimedArea): void {
  facing(area.facing);
  const allowed = facingsOf(area.kind);
  if (!allowed || allowed.includes(area.facing)) return;
  throw new RangeError(
    `Effect area ${area.kind} facing ${area.facing} is invalid: expected ${listOf(allowed)}.`,
  );
}

function facingsOf(kind: AimedAreaKind): readonly number[] | null {
  if (kind === 'diagonal_cone') return DIAGONAL_FACINGS;
  return kind === 'semicircle' || kind === 'orthogonal_cone' ? SQUARE_FACINGS : null;
}

function assertOrigin(area: EffectArea): void {
  const expected = originRuleOf(area);
  if (Number.isFinite(area.x) && Number.isFinite(area.y) && area.x >= 0 && area.y >= 0) {
    if (expected.fits(area.x, area.y)) return;
  }
  throw new RangeError(
    `Effect area ${area.kind} origin (${String(area.x)}, ${String(area.y)}) is invalid: expected ${expected.text}.`,
  );
}

type OriginRule = Readonly<{ fits: (x: number, y: number) => boolean; text: string }>;

function originRuleOf(area: EffectArea): OriginRule {
  if (area.kind === 'orthogonal_cone') return coneSideRuleOf(area.facing);
  if (area.kind === 'line')
    return { fits: (x, y) => isHalf(x) && isHalf(y), text: 'a cell center (x and y on .5)' };
  if (area.kind === 'emanation')
    return {
      fits: (x, y) => isHalfStep(x) && isHalfStep(y),
      text: 'a token footprint on half cells',
    };
  if (isSmoothArea(area))
    return {
      fits: (x, y) => isHundredth(x) && isHundredth(y),
      text: 'finite numbers ≥ 0 to the hundredth',
    };
  return {
    fits: (x, y) => Number.isInteger(x) && Number.isInteger(y),
    text: 'a grid intersection (whole x and y)',
  };
}

// The cone leaves the middle of a cell side: across the facing it sits on the half cell.
function coneSideRuleOf(direction: number): OriginRule {
  if (direction === 0 || direction === 180) {
    return {
      fits: (x, y) => Number.isInteger(x) && isHalf(y),
      text: 'x whole and y on a half cell',
    };
  }
  return { fits: (x, y) => isHalf(x) && Number.isInteger(y), text: 'x on a half cell and y whole' };
}

function assertReach(area: RoundArea | AimedArea | EmanationArea): void {
  const smooth = isSmoothArea(area);
  const fits = smooth ? isSmoothReach(area.reach) : isWholeCells(area.reach);
  if (fits) return;
  const expected = smooth ? '0.5 to 100 cells, to the hundredth' : 'whole cells from 1 to 100';
  throw new RangeError(
    `Effect area ${area.kind} reach ${String(area.reach)} is invalid: expected ${expected}.`,
  );
}

function assertSides(
  area: SquareArea | EmanationArea,
  fits: (side: number) => boolean,
  expected: string,
): void {
  for (const side of ['width', 'height'] as const) {
    if (fits(area[side])) continue;
    throw new RangeError(
      `Effect area ${area.kind} ${side} ${String(area[side])} is invalid: expected ${expected}.`,
    );
  }
}

function isWholeCells(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= EFFECT_AREA_REACH_MAX;
}

function isSmoothReach(value: number): boolean {
  return isHundredth(value) && value >= SMOOTH_REACH_MIN && value <= EFFECT_AREA_REACH_MAX;
}

function isTokenSide(value: number): boolean {
  return isHalfStep(value) && value >= TOKEN_SIZE_MIN && value <= TOKEN_SIZE_MAX;
}

function isHalf(value: number): boolean {
  return Number.isInteger(value - 0.5);
}

function isHalfStep(value: number): boolean {
  return Number.isInteger(value * 2);
}

function isHundredth(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

// Areas are stored to 0.01 cell; comparing in hundredths keeps float noise off the scene edge.
function hundredths(value: number): number {
  return Math.round(value * 100);
}

function listOf(values: readonly number[]): string {
  return `${values.slice(0, -1).join(', ')} or ${String(values.at(-1))}`;
}
