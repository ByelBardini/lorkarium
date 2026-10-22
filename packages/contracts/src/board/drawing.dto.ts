import { z } from 'zod';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import { SCENE_CELLS_MAX } from './scene.dto';
import { idGroupOf, strayExpectation, TOKEN_GROUP_MAX } from './token-id-group.dto';

/** Points of one freehand path after the client simplifies it. */
export const DRAWING_POINTS_MAX = 2000;
/** Drawings one scene keeps; the rate limit (§8.4) caps frequency, this caps what is stored. */
export const DRAWINGS_PER_SCENE_MAX = 500;
// Freehand points may sit this far outside their box: both are rounded to 0.01 cell.
const BOX_TOLERANCE = 0.01;

/** The eight drawing colors (bar colors plus ink, bone and violet), never a free hex. */
export const drawingColorDto = z.enum([
  'gold',
  'steel',
  'ember',
  'moss',
  'ash',
  'ink',
  'bone',
  'violet',
]);
export type DrawingColorDto = z.infer<typeof drawingColorDto>;

export const strokeWidthDto = z.enum(['thin', 'medium', 'thick']);
export type StrokeWidthDto = z.infer<typeof strokeWidthDto>;

export const fixedShapeKindDto = z.enum(['rectangle', 'ellipse', 'triangle']);
export type FixedShapeKindDto = z.infer<typeof fixedShapeKindDto>;

/** A position in fractional cells (x = 3.5 is the middle of the fourth column). */
const cellCoordinateDto = z.number().min(0).max(SCENE_CELLS_MAX);
const positiveSizeDto = z.number().positive().max(SCENE_CELLS_MAX);
const drawingPointDto = z.tuple([cellCoordinateDto, cellCoordinateDto]);

const styleShape = { stroke: drawingColorDto, strokeWidth: strokeWidthDto };
const cornerShape = { x: cellCoordinateDto, y: cellCoordinateDto };

type FreehandFields = { width: number; height: number; points: [number, number][] };

function checkFreehand(path: FreehandFields, context: z.RefinementCtx): void {
  const count = path.points.length;
  if (count < 2 || count > DRAWING_POINTS_MAX) {
    context.addIssue({
      code: 'custom',
      message: `freehand has ${count} points; expected 2 to ${DRAWING_POINTS_MAX}`,
    });
    return;
  }
  const outside = path.points.find(
    ([x, y]) => x > path.width + BOX_TOLERANCE || y > path.height + BOX_TOLERANCE,
  );
  if (!outside) return;
  context.addIssue({
    code: 'custom',
    message: `point ${outside.join()} is outside its box; expected inside the ${path.width}×${path.height} box`,
  });
}

const freehandShape = {
  kind: z.literal('freehand'),
  ...cornerShape,
  width: cellCoordinateDto,
  height: cellCoordinateDto,
  points: z.array(drawingPointDto),
  ...styleShape,
};

const fixedShape = {
  kind: fixedShapeKindDto,
  ...cornerShape,
  width: positiveSizeDto,
  height: positiveSizeDto,
  fill: drawingColorDto.nullable().default(null),
  ...styleShape,
};

/** A drawing as its author sends it: freehand points relative to `(x, y)`, or a fixed shape in
 *  its box (ellipse inscribed, triangle apex at the top middle). Only fixed shapes are filled.
 *
 *  Example: `drawingShapeDto.parse({ kind: 'ellipse', x: 2, y: 2, width: 3, height: 3, stroke: 'gold', strokeWidth: 'thin' })` */
export const drawingShapeDto = z.discriminatedUnion('kind', [
  z.strictObject(freehandShape).superRefine(checkFreehand),
  z.strictObject(fixedShape),
]);
export type DrawingShapeDto = z.infer<typeof drawingShapeDto>;
export type DrawingShapeInput = z.input<typeof drawingShapeDto>;

const confirmedShape = { id: z.uuid(), authorId: z.uuid().nullable() };

// Extending a refined object throws in Zod 4, so the confirmed drawing is built whole again.
/** A confirmed drawing; `authorId: null` when the author's account is gone (only the master edits it). */
export const drawingDto = z.discriminatedUnion('kind', [
  z.strictObject({ ...confirmedShape, ...freehandShape }).superRefine(checkFreehand),
  z.strictObject({ ...confirmedShape, ...fixedShape }),
]);
export type DrawingDto = z.infer<typeof drawingDto>;

const drawingPositionDto = z.strictObject({ x: cellCoordinateDto, y: cellCoordinateDto });

const drawingMoveDto = z.strictObject({
  drawingId: z.uuid(),
  ...cornerShape,
  expect: drawingPositionDto.optional(),
});
export type DrawingMoveDto = z.infer<typeof drawingMoveDto>;

const drawingAtDto = z.strictObject({ drawingId: z.uuid(), ...cornerShape });
export type DrawingAtDto = z.infer<typeof drawingAtDto>;

/** `drawing:createMany` (any member): all or nothing, one version.
 *
 *  Example: `createDrawingsCommandDto.parse({ actionId, campaignId, drawings: [square] })` */
export const createDrawingsCommandDto = z.strictObject({
  ...boardCommandShape,
  drawings: z.array(drawingShapeDto).min(1).max(TOKEN_GROUP_MAX),
});
export type CreateDrawingsCommandDto = z.infer<typeof createDrawingsCommandDto>;

/** `drawing:moveMany` (the author or the master); `expect` is the undo precondition.
 *
 *  Example: `moveDrawingsCommandDto.parse({ actionId, campaignId, moves: [{ drawingId, x: 4, y: 2 }] })` */
export const moveDrawingsCommandDto = z.strictObject({
  ...boardCommandShape,
  moves: idGroupOf(drawingMoveDto, (move) => move.drawingId, 'drawing'),
});
export type MoveDrawingsCommandDto = z.infer<typeof moveDrawingsCommandDto>;

/** `drawing:deleteMany` (the author or the master); `expect` lists where each drawing must still be.
 *
 *  Example: `deleteDrawingsCommandDto.parse({ actionId, campaignId, drawingIds: [id] })` */
export const deleteDrawingsCommandDto = z
  .strictObject({
    ...boardCommandShape,
    drawingIds: idGroupOf(z.uuid(), (drawingId) => drawingId, 'drawing'),
    expect: z.array(drawingAtDto).max(TOKEN_GROUP_MAX).optional(),
  })
  .superRefine((command, context) => {
    const stray = strayExpectation(
      command.drawingIds,
      (command.expect ?? []).map((expected) => expected.drawingId),
    );
    if (stray === undefined) return;
    context.addIssue({
      code: 'custom',
      message: `drawing ${stray} is not being deleted; expected only ids in drawingIds`,
    });
  });
export type DeleteDrawingsCommandDto = z.infer<typeof deleteDrawingsCommandDto>;

export const drawingsCreatedDto = z.strictObject({
  ...boardEventShape,
  drawings: z.array(drawingDto),
});
export type DrawingsCreatedDto = z.infer<typeof drawingsCreatedDto>;

export const drawingsMovedDto = z.strictObject({
  ...boardEventShape,
  moves: z.array(drawingAtDto),
});
export type DrawingsMovedDto = z.infer<typeof drawingsMovedDto>;

export const drawingsDeletedDto = z.strictObject({
  ...boardEventShape,
  drawingIds: z.array(z.uuid()),
});
export type DrawingsDeletedDto = z.infer<typeof drawingsDeletedDto>;
