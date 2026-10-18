import {
  RESIZE_STEP,
  resizeTokenBox,
  type ResizeHandle,
  type SceneSize,
  type TokenBox,
} from '@lorkarium/game-core';
import type { BoardView, TokenView } from './board-view';
import { CELL_WORLD_SIZE, type Point } from './camera';
import { handleTokenOf } from './facing-handle';
import { tokenWorldRect, type TokenFootprint } from './token-box';

const HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const CURSOR: Readonly<Record<ResizeHandle, string>> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};

/** The token that shows the eight handles: the same one that shows the facing handle (selected
 *  alone, this viewer may move it, the Selecionar tool).
 *
 *  Example: `resizeTokenOf(view)?.id` */
export function resizeTokenOf(view: Pick<BoardView, 'tokens' | 'tool'>): TokenView | null {
  return handleTokenOf(view);
}

/** Where each handle sits, in world px: the corners and the middle of each side.
 *
 *  Example: `resizeHandlePoints(token).se // the bottom-right corner` */
export function resizeHandlePoints(view: TokenFootprint): Readonly<Record<ResizeHandle, Point>> {
  const { x, y, width, height } = tokenWorldRect(view);
  const middle = { x: x + width / 2, y: y + height / 2 };
  return {
    nw: { x, y },
    n: { x: middle.x, y },
    ne: { x: x + width, y },
    e: { x: x + width, y: middle.y },
    se: { x: x + width, y: y + height },
    s: { x: middle.x, y: y + height },
    sw: { x, y: y + height },
    w: { x, y: middle.y },
  };
}

/** The handle a press at `world` takes, within `reach` world px (the screen reach over the zoom).
 *
 *  Example: `resizeHandleAt(token, world, 8 / zoom) // 'se'` */
export function resizeHandleAt(
  view: TokenFootprint,
  world: Point,
  reach: number,
): ResizeHandle | null {
  const points = resizeHandlePoints(view);
  const near = (handle: ResizeHandle): boolean => {
    const point = points[handle];
    return Math.abs(world.x - point.x) <= reach && Math.abs(world.y - point.y) <= reach;
  };
  return HANDLES.find(near) ?? null;
}

/** The box while `handle` is dragged from `start` to `now` (world px), by the game-core rule:
 *  snapped to half a cell (the release), or free with `step` 0 (the preview follows the pointer).
 *
 *  Example: `resizeFromDrag(scene, token, 'e', pressedAt, pointer, 0) // 10 px more, 10 px wider` */
export function resizeFromDrag(
  scene: SceneSize,
  view: TokenFootprint,
  handle: ResizeHandle,
  start: Point,
  now: Point,
  step: number = RESIZE_STEP,
): TokenBox {
  const delta = { x: (now.x - start.x) / CELL_WORLD_SIZE, y: (now.y - start.y) / CELL_WORLD_SIZE };
  const { col, row, width, height } = view;
  return resizeTokenBox(scene, { col, row, width, height }, handle, delta, step);
}

/** The pointer over a handle shows which way it stretches. */
export function resizeCursorOf(handle: ResizeHandle): string {
  return CURSOR[handle];
}
