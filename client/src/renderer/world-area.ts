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

/** How many areas the memory keeps before it starts over (a scene keeps 100 lights, and the eyes
 *  of a player a few dozen). */
export const REMEMBERED_AREAS_MAX = 256;

const remembered = new Map<string, Point[]>();
const wallSetIds = new WeakMap<readonly Wall[], number>();
let nextWallSetId = 0;

/** `worldAreaOf`, kept in memory by the center, the reach, the field, the scene and the walls
 *  array (by identity: `gameWallsOf` hands the same one while the walls do not change). The same
 *  eye or light with the same walls gives back the very same polygon, so a drag does not work it
 *  out again at every cell.
 *
 *  Example: `rememberedWorldAreaOf(eye.center, gameWallsOf(board.walls), scene, 6, eye.field)` */
export function rememberedWorldAreaOf(
  center: Vector2,
  walls: readonly Wall[],
  scene: SceneSize,
  reach: number,
  field?: ViewField,
): Point[] {
  const key = JSON.stringify([center, reach, field ?? null, scene, wallSetIdOf(walls)]);
  const known = remembered.get(key);
  if (known) return known;
  const area = worldAreaOf(center, walls, scene, reach, field);
  if (remembered.size >= REMEMBERED_AREAS_MAX) remembered.clear();
  remembered.set(key, area);
  return area;
}

/** A number per walls array (by identity; 0 for no walls): what a memory or a drawing key keeps instead of the
 *  walls themselves, so nothing serializes 300 walls on every build.
 *
 *  Example: `JSON.stringify([mode, eyes, wallSetIdOf(gameWallsOf(board.walls))])` */
export function wallSetIdOf(walls: readonly Wall[]): number {
  // Every empty array is the same: no wall cuts anything.
  if (walls.length === 0) return 0;
  const known = wallSetIds.get(walls);
  if (known !== undefined) return known;
  nextWallSetId += 1;
  wallSetIds.set(walls, nextWallSetId);
  return nextWallSetId;
}
