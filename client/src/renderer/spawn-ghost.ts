import type { SavedTokenBodyDto } from '@lorkarium/contracts';
import type { Cell, SceneSize } from '@lorkarium/game-core';
import { barFill } from '@/lib/bar-display';
import { assetUrlOf } from '@/services/assets-api';
import type { TokenView } from './token-view';
import type { Point } from './camera';
import { dropCellOf } from './token-drag';

/** The saved token armed to spawn, as the board draws its preview: the token itself (image or
 *  initials, frame, ring, first bar, facing) at its corner cell (0, 0), faded under the pointer. */
export type SpawnGhostView = Readonly<{ token: TokenView }>;

/** Not a token of any grid: the preview's own id. */
export const SPAWN_PREVIEW_ID = 'spawn-preview';

/** The preview of a saved token, from what it saved; it picks, selects and drags nothing.
 *
 *  Example: `spawnGhostOf(zombie.token).token.initials // 'ZB'` */
export function spawnGhostOf(body: SavedTokenBodyDto): SpawnGhostView {
  const first = body.bars[0];
  const { frame, flipX, flipY } = body;
  const art =
    body.imageAssetId === null ? null : { url: assetUrlOf(body.imageAssetId), frame, flipX, flipY };
  const token: TokenView = {
    ...{ id: SPAWN_PREVIEW_ID, name: body.name, initials: body.initials, ring: body.side },
    ...{ col: 0, row: 0, width: body.width, height: body.height, layer: body.layer },
    bar: first ? { ...barFill(first), color: first.color } : null,
    ...{ pickable: false, selected: false, draggable: false, onTurn: false },
    ...{ conditions: [], looks: [], art, facing: body.facing },
    ...{ facingMark: body.layer === 'tokens', defeated: false, hidden: false },
    ...{ silhouette: null, aura: null, glideMs: null },
  };
  return { token };
}

/** Where the armed token lands for the pointer at `world`: centered on it and snapped like a
 *  drop; `null` with nothing armed or when the footprint would leave the scene.
 *
 *  Example: `spawnLandingOf({ grid: { cells }, spawnGhost }, world) // cell(4, 5)` */
export function spawnLandingOf(
  view: Readonly<{ grid: Readonly<{ cells: SceneSize }>; spawnGhost: SpawnGhostView | null }>,
  world: Point,
): Cell | null {
  if (!view.spawnGhost) return null;
  return dropCellOf(view.grid.cells, view.spawnGhost.token, world);
}
