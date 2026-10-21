import { type LightSource, type SceneSize, type Wall } from '@lorkarium/game-core';
import type { Point } from './camera';
import { worldAreaOf } from './world-area';

/** What one light lights, in world px, already cut by the walls that block sight and, for a
 *  lantern or a spotlight, to its cone: `bright` up to its bright range, `dim` up to bright + dim.
 *  A side of 0 has no area. */
export type LightAreas = Readonly<{ bright: readonly Point[]; dim: readonly Point[] }>;

// The fog asks again on every frame of a drag; a light and walls that did not change are not
// worked out again. Past this many entries the memory starts over (a scene keeps 100 lights).
const REMEMBERED_MAX = 256;
const remembered = new Map<string, LightAreas>();
const wallKeys = new WeakMap<readonly Wall[], string>();

/** The areas a light lights on the scene, kept in memory by the light (its cone too) and the
 *  walls: the same light with the same walls gives back the very same areas.
 *
 *  Example: `lightAreasOf(torch, walls, { widthCells: 20, heightCells: 12 }).dim` */
export function lightAreasOf(
  light: LightSource,
  walls: readonly Wall[],
  scene: SceneSize,
): LightAreas {
  const key = JSON.stringify([light.center, light.range, light.cone, scene, wallKeyOf(walls)]);
  const known = remembered.get(key);
  if (known) return known;
  const { bright, dim } = light.range;
  const field = light.cone ? { cone: light.cone, around: null } : undefined;
  const areas = {
    bright: worldAreaOf(light.center, walls, scene, bright, field),
    dim: worldAreaOf(light.center, walls, scene, bright + dim, field),
  };
  if (remembered.size >= REMEMBERED_MAX) remembered.clear();
  remembered.set(key, areas);
  return areas;
}

// The walls of one fog are one array: their key is worked out once for all its lights.
function wallKeyOf(walls: readonly Wall[]): string {
  const known = wallKeys.get(walls);
  if (known !== undefined) return known;
  const key = JSON.stringify(walls);
  wallKeys.set(walls, key);
  return key;
}
