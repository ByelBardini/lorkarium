import { type LightSource, type SceneSize, type Wall } from '@lorkarium/game-core';
import type { Point } from './camera';
import { rememberedWorldAreaOf } from './world-area';

/** What one light lights, in world px, already cut by the walls that block sight and, for a
 *  lantern or a spotlight, to its cone: `bright` up to its bright range, `dim` up to bright + dim.
 *  A side of 0 has no area. */
export type LightAreas = Readonly<{ bright: readonly Point[]; dim: readonly Point[] }>;

/** The areas a light lights on the scene, from the memory the eyes share
 *  (`rememberedWorldAreaOf`): the same light (its cone too) with the same walls array gives back
 *  the very same polygons, so a drag does not work them out again at every frame.
 *
 *  Example: `lightAreasOf(torch, gameWallsOf(board.walls), { widthCells: 20, heightCells: 12 }).dim` */
export function lightAreasOf(
  light: LightSource,
  walls: readonly Wall[],
  scene: SceneSize,
): LightAreas {
  const { bright, dim } = light.range;
  const field = light.cone ? { cone: light.cone, around: null } : undefined;
  return {
    bright: rememberedWorldAreaOf(light.center, walls, scene, bright, field),
    dim: rememberedWorldAreaOf(light.center, walls, scene, bright + dim, field),
  };
}
