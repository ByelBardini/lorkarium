import type { ResizeHandle, TokenBox } from '@lorkarium/game-core';
import { Graphics } from 'pixi.js';
import type { BoardIntentListener } from './board-renderer';
import type { BoardView, TokenView } from './board-view';
import type { Point } from './camera';
import {
  resizeFromDrag,
  resizeHandleAt,
  resizeHandlePoints,
  resizeTokenOf,
} from './resize-handles';
import { tokenWorldRect } from './token-box';

// Design system token (client/src/index.css): the canvas cannot read CSS variables.
const GOLD_COLOR = 0xc5a46d;
const PANEL_COLOR = 0x0c0e11;
/** Screen px: the squares keep their size whatever the zoom. */
const HANDLE_SIDE = 10;
const HANDLE_REACH = 8;

type Resizing = Readonly<{ token: TokenView; handle: ResizeHandle; start: Point }> & {
  box: TokenBox;
  pointer: Point;
};

/** The eight handles of the one selected token: an outline and a square on each corner and side.
 *  Dragging a side stretches one axis, a corner scales both keeping the proportion; this viewer
 *  sees the box follow the pointer smoothly, it snaps to half a cell and is sent on release, and
 *  Esc lets go without resizing. */
export class PixiResizeHandles {
  readonly shape = new Graphics();
  private resizing: Resizing | null = null;

  constructor(private readonly onIntent: BoardIntentListener) {}

  /** Example: `handles.draw(view, camera.zoom)` */
  draw(view: BoardView, zoom: number): void {
    this.shape.clear();
    const token = resizeTokenOf(view);
    if (!token) return;
    const rect = tokenWorldRect(token);
    this.shape.rect(rect.x, rect.y, rect.width, rect.height);
    this.shape.stroke({ width: 1 / zoom, color: GOLD_COLOR, alpha: 0.8 });
    const half = HANDLE_SIDE / 2 / zoom;
    for (const point of Object.values(resizeHandlePoints(token))) {
      this.shape.rect(point.x - half, point.y - half, half * 2, half * 2);
    }
    this.shape.fill(GOLD_COLOR).stroke({ width: 1 / zoom, color: PANEL_COLOR });
  }

  /** The handle under the pointer, if any: the renderer shows its cursor. */
  handleAt(view: BoardView, world: Point, zoom: number): ResizeHandle | null {
    const token = resizeTokenOf(view);
    return token ? resizeHandleAt(token, world, HANDLE_REACH / zoom) : null;
  }

  /** A press on a handle starts resizing (and wins over the token under it). */
  press(view: BoardView, world: Point, zoom: number): boolean {
    const token = resizeTokenOf(view);
    const handle = this.handleAt(view, world, zoom);
    if (!token || !handle) return false;
    this.resizing = { token, handle, start: world, box: token, pointer: world };
    return true;
  }

  // Free while dragging (no jump of half a cell at a time); the release snaps it.
  move(view: BoardView, world: Point): boolean {
    if (!this.resizing) return false;
    const { token, handle, start, box } = this.resizing;
    this.resizing.pointer = world;
    const next = resizeFromDrag(view.grid.cells, token, handle, start, world, 0);
    if (sameBox(next, box)) return true;
    this.resizing.box = next;
    this.onIntent({ kind: 'tokenResizePreviewed', tokenId: token.id, box: next });
    return true;
  }

  release(view: BoardView): boolean {
    if (!this.resizing) return false;
    const { token, handle, start, pointer } = this.resizing;
    this.resizing = null;
    const box = resizeFromDrag(view.grid.cells, token, handle, start, pointer);
    this.onIntent({ kind: 'tokenResized', tokenId: token.id, box });
    return true;
  }

  cancel(): boolean {
    if (!this.resizing) return false;
    const { token } = this.resizing;
    this.resizing = null;
    this.onIntent({ kind: 'tokenResizePreviewed', tokenId: token.id, box: null });
    return true;
  }
}

function sameBox(left: TokenBox, right: TokenBox): boolean {
  return (
    left.col === right.col &&
    left.row === right.row &&
    left.width === right.width &&
    left.height === right.height
  );
}
