import type { DrawingDto, DrawingShapeDto } from '@lorkarium/contracts';
import { drawingBox, type DrawingBox } from '@lorkarium/game-core';
import type { DrawingOwnership } from './drawing-access.bo';
import type { DrawingPosition } from './drawing-rules.bo';
import type { DrawingMovePo, DrawingPo, NewDrawingPo } from './drawings.po';

type DrawingPoint = [number, number];

/** Drawing row → the drawing clients see; Postgres numeric "2.50" becomes 2.5.
 *
 *  Example: `toDrawingDto(row).x // 2.5` */
export function toDrawingDto(row: DrawingPo): DrawingDto {
  const base = {
    id: row.id,
    authorId: row.authorId,
    ...positionOf(row),
    width: Number(row.width),
    height: Number(row.height),
    stroke: row.stroke,
    strokeWidth: row.strokeWidth,
    layer: row.layer,
  };
  if (row.kind !== 'freehand') return { ...base, kind: row.kind, fill: row.fill };
  if (!row.points) throw new Error(`freehand drawing ${row.id} was saved with no points`);
  return { ...base, kind: 'freehand', points: row.points };
}

/** A shape as its author sent it → the row to insert; the author comes from the connection.
 *
 *  Example: `toNewDrawingPo(scene.id, userId, command.drawings[0])` */
export function toNewDrawingPo(
  sceneId: string,
  authorId: string,
  shape: DrawingShapeDto,
): NewDrawingPo {
  const common = {
    sceneId,
    authorId,
    x: numericOf(shape.x),
    y: numericOf(shape.y),
    width: numericOf(shape.width),
    height: numericOf(shape.height),
    stroke: shape.stroke,
    strokeWidth: shape.strokeWidth,
    layer: shape.layer,
  };
  if (shape.kind !== 'freehand')
    return { ...common, kind: shape.kind, points: null, fill: shape.fill };
  return { ...common, kind: 'freehand', points: shape.points.map(roundedPoint), fill: null };
}

/** The box of a shape as sent, for the scene rule.
 *
 *  Example: `rules.place(boxOfShape(shape))` */
export function boxOfShape(shape: DrawingShapeDto): DrawingBox {
  return drawingBox(shape.x, shape.y, shape.width, shape.height);
}

/** The box of a saved drawing moved to `(x, y)`, for the scene rule.
 *
 *  Example: `rules.place(boxAt(row, move))` */
export function boxAt(row: DrawingPo, at: DrawingPosition): DrawingBox {
  return drawingBox(at.x, at.y, Number(row.width), Number(row.height));
}

/** The corner of a saved drawing, in numbers. */
export function positionOf(row: DrawingPo): DrawingPosition {
  return { x: Number(row.x), y: Number(row.y) };
}

/** Who may edit a saved drawing: its id, author and layer, for the access rule. */
export function ownershipOf(row: DrawingPo): DrawingOwnership {
  return { drawingId: row.id, authorId: row.authorId, layer: row.layer };
}

/** A move as sent → the numeric strings to save, to the hundredth.
 *
 *  Example: `toDrawingMovePo({ drawingId, x: 7.125, y: 1 }) // { drawingId, x: '7.13', y: '1.00' }` */
export function toDrawingMovePo(
  move: Readonly<{ drawingId: string } & DrawingPosition>,
): DrawingMovePo {
  return { drawingId: move.drawingId, x: numericOf(move.x), y: numericOf(move.y) };
}

/** A coordinate rounded to the hundredth, as the table keeps it. */
export function toHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

function numericOf(value: number): string {
  return toHundredth(value).toFixed(2);
}

function roundedPoint([x, y]: DrawingPoint): DrawingPoint {
  return [toHundredth(x), toHundredth(y)];
}
