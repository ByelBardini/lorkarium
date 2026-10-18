import type { ResizeHandle } from '@lorkarium/game-core';
import { Graphics } from 'pixi.js';
import type { BoardIntentListener } from './board-renderer';
import type { BoardView } from './board-view';
import type { Point } from './camera';
import {
  RESIZE_HANDLE_REACH,
  resizeHandleAt,
  resizeHandlePoints,
  type ResizeTarget,
} from './resize-handles';
import { boardResizeTargetOf } from './handle-targets';

// Design system token (client/src/index.css): the canvas cannot read CSS variables.
const GOLD_COLOR = 0xc5a46d;
const PANEL_COLOR = 0x0c0e11;
/** Screen px: the squares keep their size whatever the zoom. */
const HANDLE_SIDE = 10;

type Resizing = Readonly<{ target: ResizeTarget; handle: ResizeHandle; start: Point }> & {
  previewKey: string;
  pointer: Point;
  snap: boolean;
};

/** The eight handles of the one selected piece that stretches (`boardResizeTargetOf`): an outline and
 *  a square on each corner and side. This viewer sees the preview follow the pointer, the target
 *  snaps it on release, and Esc lets go without resizing. */
export class PixiResizeHandles {
  readonly shape = new Graphics();
  private resizing: Resizing | null = null;

  constructor(private readonly onIntent: BoardIntentListener) {}

  /** Example: `handles.draw(view, camera.zoom)` */
  draw(view: BoardView, zoom: number): void {
    this.shape.clear();
    const target = boardResizeTargetOf(view);
    if (!target) return;
    const { rect } = target;
    this.shape.rect(rect.x, rect.y, rect.width, rect.height);
    this.shape.stroke({ width: 1 / zoom, color: GOLD_COLOR, alpha: 0.8 });
    const half = HANDLE_SIDE / 2 / zoom;
    for (const point of Object.values(resizeHandlePoints(rect))) {
      this.shape.rect(point.x - half, point.y - half, half * 2, half * 2);
    }
    this.shape.fill(GOLD_COLOR).stroke({ width: 1 / zoom, color: PANEL_COLOR });
  }

  /** A press on a handle starts resizing (and wins over the piece under it). */
  press(view: BoardView, world: Point, zoom: number): boolean {
    const target = boardResizeTargetOf(view);
    const handle = target && resizeHandleAt(target.rect, world, RESIZE_HANDLE_REACH / zoom);
    if (!target || !handle) return false;
    this.resizing = { target, handle, start: world, previewKey: '', pointer: world, snap: false };
    return true;
  }

  // Only a new preview is news: the pointer moves many times inside the same box.
  move(world: Point, snap: boolean): boolean {
    if (!this.resizing) return false;
    const { target, handle, start, previewKey } = this.resizing;
    this.resizing.pointer = world;
    this.resizing.snap = snap;
    const preview = target.previewed(handle, start, world, snap);
    const key = JSON.stringify(preview);
    if (key === previewKey) return true;
    this.resizing.previewKey = key;
    this.onIntent(preview);
    return true;
  }

  release(): boolean {
    if (!this.resizing) return false;
    const { target, handle, start, pointer, snap } = this.resizing;
    this.resizing = null;
    this.onIntent(target.resized(handle, start, pointer, snap));
    return true;
  }

  cancel(): boolean {
    if (!this.resizing) return false;
    const { target } = this.resizing;
    this.resizing = null;
    this.onIntent(target.cancelled());
    return true;
  }
}
