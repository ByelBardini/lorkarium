import type { EffectAreaDto, EffectAreaShapeDto } from '@lorkarium/contracts';
import type { EffectArea } from '@lorkarium/game-core';

/** A confirmed area without its id and author: the shape a command sends (the DTO is strict, so
 *  no extra field may ride along).
 *
 *  Example: `shapeOfEffectArea(cone) // { kind: 'diagonal_cone', x: 6, y: 6, reach: 3, facing: 45, color: 'ember' }` */
export function shapeOfEffectArea(area: EffectAreaDto): EffectAreaShapeDto {
  const { x, y, color } = area;
  if (area.kind === 'square')
    return { kind: area.kind, x, y, width: area.width, height: area.height, color };
  if (area.kind === 'emanation') {
    const { width, height, reach } = area;
    return { kind: area.kind, x, y, width, height, reach, color };
  }
  if ('facing' in area)
    return { kind: area.kind, x, y, reach: area.reach, facing: area.facing, color };
  return { kind: area.kind, x, y, reach: area.reach, color };
}

/** A game-core shape back as the shape a command sends, the color kept from the area it came
 *  from (the game-core keeps any string).
 *
 *  Example: `sentShapeOf(shiftEffectArea(view.area, 1, 0), view.color)` */
export function sentShapeOf(
  area: EffectArea,
  color: EffectAreaShapeDto['color'],
): EffectAreaShapeDto {
  return shapeOfEffectArea({ ...area, color, id: '', authorId: null } as EffectAreaDto);
}

/** Whether two shapes are the same to the hundredth (a reshape that changes nothing is not sent).
 *
 *  Example: `sameEffectAreaShape(before, after) // true` */
export function sameEffectAreaShape(left: EffectAreaShapeDto, right: EffectAreaShapeDto): boolean {
  return JSON.stringify(rounded(left)) === JSON.stringify(rounded(right));
}

function rounded(shape: EffectAreaShapeDto): Record<string, unknown> {
  const entries = Object.entries(shape).sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(
    entries.map(([key, value]) => [
      key,
      typeof value === 'number' ? Math.round(value * 100) : value,
    ]),
  );
}
