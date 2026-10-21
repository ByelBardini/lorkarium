import { z } from 'zod';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import { drawingColorDto } from './drawing.dto';
import { SCENE_CELLS_MAX } from './scene.dto';
import { facingDto } from './direction.dto';
import { TOKEN_SIZE_MAX, TOKEN_SIZE_MIN } from './token.dto';
import { idGroupOf, strayExpectation, TOKEN_GROUP_MAX } from './token-id-group.dto';

/** Areas one scene keeps; checked by the server. */
export const EFFECT_AREAS_PER_SCENE_MAX = 100;
/** The longest reach or side of an area, in cells: the widest scene. */
export const EFFECT_AREA_REACH_MAX = SCENE_CELLS_MAX;
const SMOOTH_REACH_MIN = 0.5;

export const effectAreaKindDto = z.enum([
  'square',
  'circle',
  'semicircle',
  'orthogonal_cone',
  'diagonal_cone',
  'line',
  'emanation',
  'smooth_circle',
  'smooth_semicircle',
]);
export type EffectAreaKindDto = z.infer<typeof effectAreaKindDto>;

const coordinateDto = z.number().min(0).max(SCENE_CELLS_MAX);
const lengthDto = z.number().min(0).max(SCENE_CELLS_MAX);
const originShape = { x: coordinateDto, y: coordinateDto, color: drawingColorDto };

const squareShape = {
  kind: z.literal('square'),
  ...originShape,
  width: lengthDto,
  height: lengthDto,
};
const roundShape = { kind: z.enum(['circle', 'smooth_circle']), ...originShape, reach: lengthDto };
const aimedShape = {
  kind: z.enum(['semicircle', 'orthogonal_cone', 'diagonal_cone', 'line', 'smooth_semicircle']),
  ...originShape,
  reach: lengthDto,
  facing: facingDto,
};
const emanationShape = {
  kind: z.literal('emanation'),
  ...originShape,
  width: lengthDto,
  height: lengthDto,
  reach: lengthDto,
};

type AreaFields = {
  kind: EffectAreaKindDto;
  x: number;
  y: number;
  reach?: number;
  width?: number;
  height?: number;
  facing?: number;
};

// The rules of `effectArea` (game-core) written again, with the same messages: contracts only depends on zod.
function checkEffectArea(area: AreaFields, context: z.RefinementCtx): void {
  const problem =
    facingProblemOf(area) ?? originProblemOf(area) ?? reachProblemOf(area) ?? sideProblemOf(area);
  if (problem) context.addIssue({ code: 'custom', message: `effect area ${area.kind} ${problem}` });
}

const SQUARE_FACINGS = [0, 90, 180, 270];
const DIAGONAL_FACINGS = [45, 135, 225, 315];

function facingProblemOf(area: AreaFields): string | null {
  if (area.facing === undefined) return null;
  const allowed = area.kind === 'diagonal_cone' ? DIAGONAL_FACINGS : SQUARE_FACINGS;
  const free = area.kind === 'line' || area.kind === 'smooth_semicircle';
  if (free || allowed.includes(area.facing)) return null;
  return `facing ${area.facing} is invalid; expected ${allowed.slice(0, -1).join(', ')} or ${String(allowed.at(-1))}`;
}

function originProblemOf(area: AreaFields): string | null {
  const [fits, expected] = originRuleOf(area);
  if (fits(area.x) && fits(area.y, true)) return null;
  return `origin (${area.x}, ${area.y}) is invalid; expected ${expected}`;
}

type CoordinateRule = (value: number, isY?: boolean) => boolean;

function originRuleOf(area: AreaFields): [CoordinateRule, string] {
  if (area.kind === 'orthogonal_cone') {
    const across = area.facing === 0 || area.facing === 180;
    const rule: CoordinateRule = (value, isY = false) =>
      isY === across ? isHalf(value) : Number.isInteger(value);
    return [rule, across ? 'x whole and y on a half cell' : 'x on a half cell and y whole'];
  }
  if (area.kind === 'line') return [isHalf, 'a cell center (x and y on .5)'];
  if (area.kind === 'emanation') return [isHalfStep, 'a token footprint on half cells'];
  if (isSmooth(area.kind)) return [isHundredth, 'finite numbers ≥ 0 to the hundredth'];
  return [Number.isInteger, 'a grid intersection (whole x and y)'];
}

function reachProblemOf(area: AreaFields): string | null {
  if (area.reach === undefined) return null;
  if (isSmooth(area.kind)) {
    const fits = isHundredth(area.reach) && area.reach >= SMOOTH_REACH_MIN;
    return fits
      ? null
      : `reach ${area.reach} is invalid; expected 0.5 to 100 cells, to the hundredth`;
  }
  return isWholeCells(area.reach)
    ? null
    : `reach ${area.reach} is invalid; expected whole cells from 1 to 100`;
}

function sideProblemOf(area: AreaFields): string | null {
  for (const side of ['width', 'height'] as const) {
    const value = area[side];
    if (value === undefined) continue;
    if (area.kind === 'square' && !isWholeCells(value)) {
      return `${side} ${value} is invalid; expected whole cells from 1 to 100`;
    }
    if (
      area.kind === 'emanation' &&
      !(isHalfStep(value) && value >= TOKEN_SIZE_MIN && value <= TOKEN_SIZE_MAX)
    ) {
      return `${side} ${value} is invalid; expected a multiple of 0.5 from ${TOKEN_SIZE_MIN} to ${TOKEN_SIZE_MAX}`;
    }
  }
  return null;
}

function isSmooth(kind: EffectAreaKindDto): boolean {
  return kind === 'smooth_circle' || kind === 'smooth_semicircle';
}

function isWholeCells(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= EFFECT_AREA_REACH_MAX;
}

function isHalf(value: number): boolean {
  return Number.isInteger(value - 0.5);
}

function isHalfStep(value: number): boolean {
  return Number.isInteger(value * 2);
}

function isHundredth(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

/** An area of effect as its author sends it, one strict object per family of `kind`: square
 *  (whole cells), round, aimed (with `facing`) or emanation (a token footprint plus reach).
 *
 *  Example: `effectAreaShapeDto.parse({ kind: 'circle', x: 5, y: 5, reach: 3, color: 'ember' })` */
export const effectAreaShapeDto = z.discriminatedUnion('kind', [
  z.strictObject(squareShape).superRefine(checkEffectArea),
  z.strictObject(roundShape).superRefine(checkEffectArea),
  z.strictObject(aimedShape).superRefine(checkEffectArea),
  z.strictObject(emanationShape).superRefine(checkEffectArea),
]);
export type EffectAreaShapeDto = z.infer<typeof effectAreaShapeDto>;

const confirmedShape = { id: z.uuid(), authorId: z.uuid().nullable() };

// Extending a refined object throws in Zod 4, so the confirmed area is built whole again.
/** A confirmed area; `authorId: null` when the author's account is gone (only the master edits it). */
export const effectAreaDto = z.discriminatedUnion('kind', [
  z.strictObject({ ...confirmedShape, ...squareShape }).superRefine(checkEffectArea),
  z.strictObject({ ...confirmedShape, ...roundShape }).superRefine(checkEffectArea),
  z.strictObject({ ...confirmedShape, ...aimedShape }).superRefine(checkEffectArea),
  z.strictObject({ ...confirmedShape, ...emanationShape }).superRefine(checkEffectArea),
]);
export type EffectAreaDto = z.infer<typeof effectAreaDto>;

const effectAreaReshapeDto = z.strictObject({
  effectAreaId: z.uuid(),
  shape: effectAreaShapeDto,
  expect: effectAreaShapeDto.optional(),
});
export type EffectAreaReshapeDto = z.infer<typeof effectAreaReshapeDto>;

const effectAreaShapedDto = z.strictObject({ effectAreaId: z.uuid(), shape: effectAreaShapeDto });
export type EffectAreaShapedDto = z.infer<typeof effectAreaShapedDto>;

/** `effectArea:createMany` (any member): all or nothing, one version; the ack names the new ids.
 *
 *  Example: `createEffectAreasCommandDto.parse({ actionId, campaignId, effectAreas: [circle] })` */
export const createEffectAreasCommandDto = z.strictObject({
  ...boardCommandShape,
  effectAreas: z.array(effectAreaShapeDto).min(1).max(TOKEN_GROUP_MAX),
});
export type CreateEffectAreasCommandDto = z.infer<typeof createEffectAreasCommandDto>;

/** `effectArea:reshapeMany` (the author or the master): move, stretch and turn send the whole
 *  new shape; `expect` is the undo precondition (the shape it must still have).
 *
 *  Example: `reshapeEffectAreasCommandDto.parse({ actionId, campaignId, reshapes: [{ effectAreaId, shape }] })` */
export const reshapeEffectAreasCommandDto = z.strictObject({
  ...boardCommandShape,
  reshapes: idGroupOf(effectAreaReshapeDto, (reshape) => reshape.effectAreaId, 'effect area'),
});
export type ReshapeEffectAreasCommandDto = z.infer<typeof reshapeEffectAreasCommandDto>;

/** `effectArea:deleteMany` (the author or the master); `expect` lists the shape each must still have.
 *
 *  Example: `deleteEffectAreasCommandDto.parse({ actionId, campaignId, effectAreaIds: [id] })` */
export const deleteEffectAreasCommandDto = z
  .strictObject({
    ...boardCommandShape,
    effectAreaIds: idGroupOf(z.uuid(), (effectAreaId) => effectAreaId, 'effect area'),
    expect: z.array(effectAreaShapedDto).max(TOKEN_GROUP_MAX).optional(),
  })
  .superRefine((command, context) => {
    const stray = strayExpectation(
      command.effectAreaIds,
      (command.expect ?? []).map((expected) => expected.effectAreaId),
    );
    if (stray === undefined) return;
    context.addIssue({
      code: 'custom',
      message: `effect area ${stray} is not being deleted; expected only ids in effectAreaIds`,
    });
  });
export type DeleteEffectAreasCommandDto = z.infer<typeof deleteEffectAreasCommandDto>;

export const effectAreasCreatedDto = z.strictObject({
  ...boardEventShape,
  effectAreas: z.array(effectAreaDto),
});
export type EffectAreasCreatedDto = z.infer<typeof effectAreasCreatedDto>;

export const effectAreasReshapedDto = z.strictObject({
  ...boardEventShape,
  reshapes: z.array(effectAreaShapedDto),
});
export type EffectAreasReshapedDto = z.infer<typeof effectAreasReshapedDto>;

export const effectAreasDeletedDto = z.strictObject({
  ...boardEventShape,
  effectAreaIds: z.array(z.uuid()),
});
export type EffectAreasDeletedDto = z.infer<typeof effectAreasDeletedDto>;
