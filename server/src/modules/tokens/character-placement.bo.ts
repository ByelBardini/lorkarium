import {
  cell,
  freeCellsAround,
  tokenSize,
  type Cell,
  type SceneSize,
  type TokenBox,
  type TokenSize,
} from '@lorkarium/game-core';
import { placeInScene } from './token-rules.bo';
import { NoFreeCellsError } from './tokens.error';

/** Where "Adicionar jogadores" puts each character: around `center` (the middle of the master's
 *  view), off the `occupied` boxes of the Tokens layer, in the order of `footprints`. */
export type CharacterPlacement = Readonly<{
  sceneId: string;
  scene: SceneSize;
  center: Readonly<{ col: number; row: number }>;
  footprints: readonly Readonly<{ width: number; height: number }>[];
  occupied: readonly TokenBox[];
}>;

/** The top-left cell of each footprint, all or nothing: a grid without room for every one is
 *  NO_FREE_CELLS citing how many were left out; a center outside the grid is OUT_OF_SCENE.
 *
 *  Example: `placeCharacters({ sceneId, scene, center: { col: 5, row: 5 }, footprints, occupied })` */
export function placeCharacters(placement: CharacterPlacement): Cell[] {
  const { sceneId, scene, occupied } = placement;
  placeInScene(scene, placement.center, { width: 1, height: 1 });
  const center = cell(placement.center.col, placement.center.row);
  const sizes = placement.footprints.map(({ width, height }) => tokenSize(width, height));
  const placed = freeCellsAround(center, sizes, occupied, scene);
  if (placed) return placed;
  const fitting = fittingCount(center, sizes, occupied, scene);
  throw new NoFreeCellsError(sceneId, sizes.length - fitting, sizes.length);
}

// How many of the first footprints still fit, to say how many were left out.
function fittingCount(
  center: Cell,
  sizes: readonly TokenSize[],
  occupied: readonly TokenBox[],
  scene: SceneSize,
): number {
  for (let count = sizes.length - 1; count > 0; count -= 1) {
    if (freeCellsAround(center, sizes.slice(0, count), occupied, scene)) return count;
  }
  return 0;
}
