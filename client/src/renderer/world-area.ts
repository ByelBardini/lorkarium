import {
  sightArea,
  type SceneSize,
  type Vector2,
  type ViewField,
  type Wall,
} from '@lorkarium/game-core';
import { CELL_WORLD_SIZE, type Point } from './camera';

/** What a point sees or lights up to `reach` cells, in world px, cut by the walls and the scene and,
 *  with a `field`, to its cone (and ring): the game-core `sightArea` scaled to the canvas. A reach
 *  of 0 has no area.
 *
 *  Example: `worldAreaOf(lyraCenter, walls, { widthCells: 20, heightCells: 12 }, 6, lyraField)` */
export function worldAreaOf(
  center: Vector2,
  walls: readonly Wall[],
  scene: SceneSize,
  reach: number,
  field?: ViewField,
): Point[] {
  if (reach <= 0) return [];
  return sightArea(center, walls, scene, reach, field).map(({ x, y }) => ({
    x: x * CELL_WORLD_SIZE,
    y: y * CELL_WORLD_SIZE,
  }));
}
