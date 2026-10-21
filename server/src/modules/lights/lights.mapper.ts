import type {
  LightAtDto,
  LightColorOfDto,
  LightConeOfDto,
  LightDto,
  LightPlacementDto,
  LightRangeOfDto,
} from '@lorkarium/contracts';
import {
  lightConeOf,
  lightRange,
  lightSource,
  sceneLight,
  type LightRange,
  type LightSource,
  type SceneLight,
} from '@lorkarium/game-core';
import { cellsHundredth, cellsNumeric } from '../../database/cells-numeric';
import type { LightColor, LightCone, LightPosition } from './light-rules.bo';
import type {
  LightColorPo,
  LightConePo,
  LightMovePo,
  LightPo,
  LightRangePo,
  NewLightPo,
} from './lights.po';

/** Light row → the light clients see; Postgres numeric "5.50" becomes 5.5. A row the game-core
 *  refuses is a broken table and throws citing the light.
 *
 *  Example: `toLightDto(row).x // 5.5` */
export function toLightDto(row: LightPo): LightDto {
  const { x, y, range, lit, facing, angle } = sceneLightOf(row);
  const { bright, dim } = range;
  return { id: row.id, x, y, bright, dim, lit, color: row.color, facing, angle };
}

/** Light row → the game-core light the rules and sight work with.
 *
 *  Example: `sceneLightOf(row).range.bright // 4` */
export function sceneLightOf(row: LightPo): SceneLight {
  try {
    const range = lightRange(Number(row.bright), Number(row.dim));
    const { lit, facing, angle } = row;
    return sceneLight({ x: Number(row.x), y: Number(row.y), range, lit, facing, angle });
  } catch (cause) {
    throw new Error(`light ${row.id} was saved broken: ${String(cause)}`, { cause });
  }
}

/** A placement as the master sent it → the game-core light, born lit, for the scene rule.
 *
 *  Example: `rules.place(sceneLightOfPlacement(command.lights[0]))` */
export function sceneLightOfPlacement(placement: LightPlacementDto): SceneLight {
  const range = lightRange(placement.bright, placement.dim);
  const { x, y, facing, angle } = placement;
  return sceneLight({ x, y, range, lit: true, facing, angle });
}

/** A saved light moved to `(x, y)`, for the scene rule.
 *
 *  Example: `rules.place(lightMovedTo(sceneLightOf(row), move))` */
export function lightMovedTo(light: SceneLight, at: LightPosition): SceneLight {
  return sceneLight({ ...light, x: at.x, y: at.y });
}

/** The light a saved map light gives off from its point, in its cone (none at 360), or `null`
 *  when it is out.
 *
 *  Example: `rows.flatMap((row) => lightSourceOfRow(row) ?? [])` */
export function lightSourceOfRow(row: LightPo): LightSource | null {
  const light = sceneLightOf(row);
  return lightSource({ x: light.x, y: light.y }, light.range, light.lit, lightConeOf(light));
}

/** A placement as sent → the row to insert, to the hundredth, lit and in its color.
 *
 *  Example: `toNewLightPo(scene.id, command.lights[0])` */
export function toNewLightPo(sceneId: string, placement: LightPlacementDto): NewLightPo {
  return {
    sceneId,
    x: cellsNumeric(placement.x),
    y: cellsNumeric(placement.y),
    bright: cellsNumeric(placement.bright),
    dim: cellsNumeric(placement.dim),
    lit: true,
    color: placement.color,
    facing: placement.facing,
    angle: placement.angle,
  };
}

/** A move as sent → the numeric strings to save, to the hundredth.
 *
 *  Example: `toLightMovePo({ lightId, x: 7.125, y: 1 }) // { lightId, x: '7.13', y: '1.00' }` */
export function toLightMovePo(move: LightAtDto): LightMovePo {
  return { lightId: move.lightId, x: cellsNumeric(move.x), y: cellsNumeric(move.y) };
}

/** A range change as sent → the numeric strings to save, to the hundredth.
 *
 *  Example: `toLightRangePo({ lightId, bright: 6, dim: 10 / 3 }) // { …, dim: '3.33' }` */
export function toLightRangePo(change: LightRangeOfDto): LightRangePo {
  const { lightId, bright, dim } = change;
  return { lightId, bright: cellsNumeric(bright), dim: cellsNumeric(dim) };
}

/** A move as the table keeps it: the point to the hundredth, in numbers for the event.
 *
 *  Example: `savedMoveOf({ lightId, x: 7.125, y: 1 }) // { lightId, x: 7.13, y: 1 }` */
export function savedMoveOf({ lightId, x, y }: LightAtDto): LightAtDto {
  return { lightId, x: cellsHundredth(x), y: cellsHundredth(y) };
}

/** A range change as the table keeps it: to the hundredth, in numbers for the event.
 *
 *  Example: `savedRangeOf({ lightId, bright: 6, dim: 10 / 3 }) // { lightId, bright: 6, dim: 3.33 }` */
export function savedRangeOf({ lightId, bright, dim }: LightRangeOfDto): LightRangeOfDto {
  return { lightId, bright: cellsHundredth(bright), dim: cellsHundredth(dim) };
}

/** The point of a saved light, in numbers. */
export function positionOfLight(row: LightPo): LightPosition {
  return { x: Number(row.x), y: Number(row.y) };
}

/** The range of a saved light, in numbers. */
export function rangeOfLight(row: LightPo): LightRange {
  return { bright: Number(row.bright), dim: Number(row.dim) };
}

/** A color change as sent → the color to save (`null` = neutral).
 *
 *  Example: `toLightColorPo({ lightId, color: 'fire', expect }) // { lightId, color: 'fire' }` */
export function toLightColorPo({ lightId, color }: LightColorOfDto): LightColorPo {
  return { lightId, color };
}

/** A color change as the table publishes it, without the undo precondition.
 *
 *  Example: `savedColorOf({ lightId, color: 'fire', expect }) // { lightId, color: 'fire' }` */
export function savedColorOf({ lightId, color }: LightColorOfDto): LightColorOfDto {
  return { lightId, color };
}

/** A cone change as sent → where the light points and how wide it opens, to save.
 *
 *  Example: `toLightConePo({ lightId, facing: 90, angle: 60, expect }) // { lightId, facing: 90, angle: 60 }` */
export function toLightConePo({ lightId, facing, angle }: LightConeOfDto): LightConePo {
  return { lightId, facing, angle };
}

/** A cone change as the table publishes it, without the undo precondition.
 *
 *  Example: `savedConeOf({ lightId, facing: 90, angle: 60, expect }) // { lightId, facing: 90, angle: 60 }` */
export function savedConeOf({ lightId, facing, angle }: LightConeOfDto): LightConeOfDto {
  return { lightId, facing, angle };
}

/** The cone of a saved light, as the rule compares it. */
export function coneOfLight(row: LightPo): LightCone {
  return { facing: row.facing, angle: row.angle };
}

/** The color of a saved light, as the rule compares it. */
export function colorOfLight(row: LightPo): LightColor {
  return row.color;
}
