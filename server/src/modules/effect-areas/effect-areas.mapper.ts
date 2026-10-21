import type { EffectAreaDto, EffectAreaShapeDto, EffectAreaShapedDto } from '@lorkarium/contracts';
import { effectArea, type EffectArea } from '@lorkarium/game-core';
import type { AuthoredPiece } from '../scenes/authored-access.bo';
import type { EffectAreaPo, EffectAreaReshapePo, NewEffectAreaPo } from './effect-areas.po';

type ShapeColumns = EffectAreaReshapePo['shape'];

/** Area row → the area clients see, with only the fields of its kind; numeric "5.50" becomes
 *  5.5. A row that breaks the shape rule is a broken table and throws citing the area.
 *
 *  Example: `toEffectAreaDto(row).y // 5.5` */
export function toEffectAreaDto(row: EffectAreaPo): EffectAreaDto {
  return { id: row.id, authorId: row.authorId, ...shapeOfRow(row) };
}

/** The shape kept in a row, checked by the game-core rule (a broken row throws citing it).
 *
 *  Example: `rules.requireShape(row.id, expected, shapeOfRow(row))` */
export function shapeOfRow(row: EffectAreaPo): EffectAreaShapeDto {
  try {
    return effectArea(shapeOfColumns(row));
  } catch (error) {
    throw new Error(`effect area ${row.id} was saved broken: ${(error as Error).message}`, {
      cause: error,
    });
  }
}

/** The shape a reshape saves, rounded to the hundredth as the table keeps it (what the event says).
 *
 *  Example: `savedShapeOf(toEffectAreaReshapePo(reshape))` */
export function savedShapeOf(reshape: EffectAreaReshapePo): EffectAreaShapedDto {
  return { effectAreaId: reshape.effectAreaId, shape: shapeOfColumns(reshape.shape) };
}

/** A shape as sent → the VO the scene rule reads.
 *
 *  Example: `rules.place(areaOfShape(shape))` */
export function areaOfShape(shape: EffectAreaShapeDto): EffectArea {
  return effectArea(shape);
}

/** A shape as its author sent it → the row to insert: the author comes from the connection,
 *  fields the kind does not use are 0 and numbers are rounded to the hundredth.
 *
 *  Example: `toNewEffectAreaPo(scene.id, userId, command.effectAreas[0])` */
export function toNewEffectAreaPo(
  sceneId: string,
  authorId: string,
  shape: EffectAreaShapeDto,
): NewEffectAreaPo {
  return { sceneId, authorId, ...columnsOf(shape) };
}

/** A reshape as sent → the columns to save.
 *
 *  Example: `toEffectAreaReshapePo({ effectAreaId, shape })` */
export function toEffectAreaReshapePo(reshape: EffectAreaShapedDto): EffectAreaReshapePo {
  return { effectAreaId: reshape.effectAreaId, shape: columnsOf(reshape.shape) };
}

/** Who may edit a saved area: its id and author, for the access rule. */
export function ownershipOf(row: EffectAreaPo): AuthoredPiece {
  return { id: row.id, authorId: row.authorId };
}

function columnsOf(shape: EffectAreaShapeDto): ShapeColumns {
  return {
    kind: shape.kind,
    x: numericOf(shape.x),
    y: numericOf(shape.y),
    width: numericOf('width' in shape ? shape.width : 0),
    height: numericOf('height' in shape ? shape.height : 0),
    reach: numericOf('reach' in shape ? shape.reach : 0),
    facing: 'facing' in shape ? shape.facing : 0,
    color: shape.color,
  };
}

function shapeOfColumns(row: ShapeColumns): EffectAreaShapeDto {
  const base = { x: Number(row.x), y: Number(row.y), color: row.color };
  const box = { width: Number(row.width), height: Number(row.height) };
  const reach = Number(row.reach);
  if (row.kind === 'square') return { kind: row.kind, ...base, ...box };
  if (row.kind === 'emanation') return { kind: row.kind, ...base, ...box, reach };
  if (row.kind === 'circle' || row.kind === 'smooth_circle') {
    return { kind: row.kind, ...base, reach };
  }
  return { kind: row.kind, ...base, reach, facing: row.facing ?? 0 };
}

function numericOf(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}
