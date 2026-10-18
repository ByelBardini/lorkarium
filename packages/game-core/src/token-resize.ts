import type { SceneSize } from './grid';
import { TOKEN_SIZE_MAX, TOKEN_SIZE_MIN } from './token-size.vo';

/** Where a token stands and how much it covers, in cells. */
export type TokenBox = Readonly<{ col: number; row: number; width: number; height: number }>;

/** The eight handles of a selected token: four sides and four corners, by compass point. */
export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** How far the pointer went since the press, in cells. */
export type ResizeDelta = Readonly<{ x: number; y: number }>;

/** The step a side snaps to on release: half a cell. */
export const RESIZE_STEP = 0.5;

type Axis = Readonly<{
  start: number;
  length: number;
  sceneLength: number;
  pull: -1 | 0 | 1;
  step: number;
}>;

/** The box after dragging `handle` by `delta`: a side stretches its axis, a corner scales both
 *  keeping the proportion, and the opposite side stays where it was. Sides snap to half a cell
 *  (`step`, 0 = free: the preview that follows the pointer) and stay within 0.5–10 cells and the
 *  scene.
 *
 *  Example: `resizeTokenBox(scene, { col: 3, row: 3, width: 2, height: 2 }, 'w', { x: -1, y: 0 })` → `{ col: 2, row: 3, width: 3, height: 2 }` */
export function resizeTokenBox(
  scene: SceneSize,
  box: TokenBox,
  handle: ResizeHandle,
  delta: ResizeDelta,
  step: number = RESIZE_STEP,
): TokenBox {
  const across = axisOf(box.col, box.width, scene.widthCells, pullOf(handle, 'w', 'e'), step);
  const down = axisOf(box.row, box.height, scene.heightCells, pullOf(handle, 'n', 's'), step);
  const isCorner = handle.length === 2;
  const width = isCorner ? box.width : stretched(across, delta.x);
  const height = isCorner ? box.height : stretched(down, delta.y);
  if (!isCorner) return placed(across, down, width, height);
  const scale = cornerScale(across, down, delta);
  return placed(across, down, sideOf(across, box.width * scale), sideOf(down, box.height * scale));
}

function axisOf(
  start: number,
  length: number,
  sceneLength: number,
  pull: -1 | 0 | 1,
  step: number,
): Axis {
  return { start, length, sceneLength, pull, step };
}

function pullOf(handle: ResizeHandle, back: 'n' | 'w', forth: 's' | 'e'): -1 | 0 | 1 {
  if (handle.includes(back)) return -1;
  return handle.includes(forth) ? 1 : 0;
}

function stretched(axis: Axis, move: number): number {
  if (axis.pull === 0) return axis.length;
  return sideOf(axis, axis.length + axis.pull * move);
}

function cornerScale(across: Axis, down: Axis, delta: ResizeDelta): number {
  const growth = across.pull * delta.x + down.pull * delta.y;
  const wanted = 1 + growth / (across.length + down.length);
  const least = Math.max(TOKEN_SIZE_MIN / across.length, TOKEN_SIZE_MIN / down.length);
  const most = Math.min(roomOf(across) / across.length, roomOf(down) / down.length);
  return Math.min(Math.max(wanted, least), most);
}

// Room the side can grow into: up to the scene edge it is pulled toward, never past ten cells.
function roomOf(axis: Axis): number {
  const toEdge = axis.pull < 0 ? axis.start + axis.length : axis.sceneLength - axis.start;
  const room = axis.step > 0 ? Math.floor(toEdge / axis.step) * axis.step : toEdge;
  return Math.min(TOKEN_SIZE_MAX, room);
}

function sideOf(axis: Axis, wanted: number): number {
  const snapped = axis.step > 0 ? Math.round(wanted / axis.step) * axis.step : wanted;
  return Math.min(Math.max(snapped, TOKEN_SIZE_MIN), roomOf(axis));
}

function placed(across: Axis, down: Axis, width: number, height: number): TokenBox {
  return { col: startOf(across, width), row: startOf(down, height), width, height };
}

function startOf(axis: Axis, length: number): number {
  return axis.pull < 0 ? axis.start + axis.length - length : axis.start;
}
