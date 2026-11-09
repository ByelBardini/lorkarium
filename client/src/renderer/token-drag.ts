import {
  POSITION_STEP,
  cell,
  footprintFits,
  type Cell,
  type SceneSize,
  type TokenSize,
} from '@lorkarium/game-core';
import { CELL_WORLD_SIZE, type Point } from './camera';
import { tokenCenterOf, type TokenFootprint } from './token-box';

// Below this a press on a token is a click (select), not a drag.
const DRAG_THRESHOLD_PX = 4;

/** The cell a token of `size` lands on when released with its center at `world`: snapped to the
 *  grid (to half a cell on an axis whose side is fractional, so a 0.5 token fits half a cell), and
 *  `null` when it would not fit the scene (nothing is sent then). With `free` (a free-movement
 *  grid) it lands where it was let go, on the nearest `POSITION_STEP`.
 *
 *  Example: `dropCellOf(scene, token, screenToWorld(camera, pointer), view.grid.freeMovement)` */
export function dropCellOf(
  scene: SceneSize,
  size: TokenSize,
  world: Point,
  free = false,
): Cell | null {
  if (free) return freeDropOf(scene, size, world);
  const col = snapAxis(world.x / CELL_WORLD_SIZE - size.width / 2, size.width);
  const row = snapAxis(world.y / CELL_WORLD_SIZE - size.height / 2, size.height);
  if (col < 0 || row < 0) return null;
  const landing = cell(col, row);
  return footprintFits(scene, landing, size) ? landing : null;
}

function snapAxis(start: number, side: number): number {
  const steps = Number.isInteger(side) ? 1 : 2;
  return Math.round(start * steps) / steps;
}

function freeDropOf(scene: SceneSize, size: TokenSize, world: Point): Cell | null {
  const centerCol = world.x / CELL_WORLD_SIZE;
  const centerRow = world.y / CELL_WORLD_SIZE;
  if (centerCol < 0 || centerRow < 0) return null;
  if (centerCol > scene.widthCells || centerRow > scene.heightCells) return null;
  const col = freeAxis(centerCol - size.width / 2, scene.widthCells - size.width);
  const row = freeAxis(centerRow - size.height / 2, scene.heightCells - size.height);
  const landing = cell(col, row);
  return footprintFits(scene, landing, size) ? landing : null;
}

// Rounded first, limited after: both limits are steps themselves (whole scene minus a side in half
// cells), so the edge is never off the step. `Math.max` also turns a rounded -0 into 0.
function freeAxis(start: number, limit: number): number {
  const stepped = Math.round(start / POSITION_STEP) * POSITION_STEP;
  return Math.max(0, Math.min(stepped, limit));
}

export type TokenPress = Readonly<{
  tokenId: string;
  draggable: boolean;
  start: Point;
  dragging: boolean;
  /** Where the press took the token, from its center (world px): the drag keeps that hold. */
  grab: Point;
}>;

const CENTERED: Point = { x: 0, y: 0 };

/** Example: `press = pressToken(view.id, view.draggable, screenPoint, grabOffsetOf(view, world))` */
export function pressToken(
  tokenId: string,
  draggable: boolean,
  at: Point,
  grab: Point = CENTERED,
): TokenPress {
  return { tokenId, draggable, start: at, dragging: false, grab };
}

/** How far from the token's center the press landed, in world px.
 *
 *  Example: `grabOffsetOf(kael, world) // { x: -24, y: -24 } near the top-left corner` */
export function grabOffsetOf(token: TokenFootprint, world: Point): Point {
  const center = tokenCenterOf(token);
  return { x: world.x - center.x, y: world.y - center.y };
}

/** Where the dragged token's center is with the pointer at `world`: the hold is kept, so the
 *  token never jumps to center itself under the pointer.
 *
 *  Example: `layer.drag(press.tokenId, heldCenterOf(press, world))` */
export function heldCenterOf(press: TokenPress, world: Point): Point {
  return { x: world.x - press.grab.x, y: world.y - press.grab.y };
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
