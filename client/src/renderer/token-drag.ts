import {
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
 *  `null` when it would not fit the scene (nothing is sent then).
 *
 *  Example: `dropCellOf(scene, token, screenToWorld(camera, pointer))` */
export function dropCellOf(scene: SceneSize, size: TokenSize, world: Point): Cell | null {
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
