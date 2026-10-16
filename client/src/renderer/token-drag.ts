import { cell, footprintFits, type Cell, type SceneSize } from '@lorkarium/game-core';
import { CELL_WORLD_SIZE, type Point } from './camera';

// Below this a press on a token is a click (select), not a drag.
const DRAG_THRESHOLD_PX = 4;

/** The cell a token of `size` lands on when released with its center at `world`: snapped to the
 *  grid, and `null` when it would not fit the scene (nothing is sent then).
 *
 *  Example: `dropCellOf(scene, token.size, screenToWorld(camera, pointer))` */
export function dropCellOf(scene: SceneSize, size: number, world: Point): Cell | null {
  const half = (size * CELL_WORLD_SIZE) / 2;
  const col = Math.round((world.x - half) / CELL_WORLD_SIZE);
  const row = Math.round((world.y - half) / CELL_WORLD_SIZE);
  if (col < 0 || row < 0) return null;
  const landing = cell(col, row);
  return footprintFits(scene, landing, size) ? landing : null;
}

export type TokenPress = Readonly<{
  tokenId: string;
  draggable: boolean;
  start: Point;
  dragging: boolean;
}>;

/** Example: `press = pressToken(view.id, view.draggable, { x: event.offsetX, y: event.offsetY })` */
export function pressToken(tokenId: string, draggable: boolean, at: Point): TokenPress {
  return { tokenId, draggable, start: at, dragging: false };
}

/** The press after the pointer moved: a draggable token starts dragging from 4 px on.
 *
 *  Example: `const { press, dragging } = movePress(press, point); if (dragging) layer.drag(id, world)` */
export function movePress(
  press: TokenPress,
  at: Point,
): Readonly<{ press: TokenPress; dragging: boolean }> {
  if (press.dragging || !press.draggable) return { press, dragging: press.dragging };
  const travelled = Math.hypot(at.x - press.start.x, at.y - press.start.y);
  const dragging = travelled >= DRAG_THRESHOLD_PX;
  return { press: { ...press, dragging }, dragging };
}

/** `drop` for a token that was dragged, `pick` (select it) otherwise.
 *
 *  Example: `if (releasePress(press) === 'drop') onIntent({ kind: 'tokenDropped', … })` */
export function releasePress(press: TokenPress): 'pick' | 'drop' {
  return press.dragging ? 'drop' : 'pick';
}
