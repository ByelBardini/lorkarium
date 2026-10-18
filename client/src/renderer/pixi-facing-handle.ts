import { Graphics } from 'pixi.js';
import type { BoardIntentListener } from './board-renderer';
import type { BoardView } from './board-view';
import type { Point } from './camera';
import { handleAt, type FacingTarget } from './facing-handle';
import { boardFacingTargetOf } from './handle-targets';

// Design system token (client/src/index.css): the canvas cannot read CSS variables.
const GOLD_COLOR = 0xc5a46d;
const HANDLE_SIDE = 10;

type Turning = { target: FacingTarget; facing: number };

/** The handle of the one selected piece that turns (`boardFacingTargetOf`): a line from its edge to a
 *  small square where it looks. Dragging the square turns it: this viewer sees it at once, the
 *  turn is sent on release and Esc lets go without turning. */
export class PixiFacingHandle {
  readonly shape = new Graphics();
  private turning: Turning | null = null;

  constructor(private readonly onIntent: BoardIntentListener) {}

  /** Hairlines whatever the zoom, like the grid. */
  draw(view: BoardView, zoom: number): void {
    this.shape.clear();
    const target = boardFacingTargetOf(view);
    if (!target) return;
    const { from, to: handle } = target.stem;
    const half = HANDLE_SIDE / 2 / zoom;
    this.shape.moveTo(from.x, from.y).lineTo(handle.x, handle.y);
    this.shape.stroke({ width: 1.5 / zoom, color: GOLD_COLOR });
    this.shape.rect(handle.x - half, handle.y - half, half * 2, half * 2).fill(GOLD_COLOR);
  }

  /** A press on the handle starts turning (and wins over the token under it). */
  press(view: BoardView, world: Point): boolean {
    const target = boardFacingTargetOf(view);
    if (!target || !handleAt(target, world)) return false;
    this.turning = { target, facing: target.facing };
    return true;
  }

  move(world: Point, snap: boolean): boolean {
    if (!this.turning) return false;
    const { target, facing } = this.turning;
    const next = target.facingAt(world, facing, snap);
    if (next === facing) return true;
    this.turning = { target, facing: next };
    this.onIntent(target.previewed(next));
    return true;
  }

  release(): boolean {
    if (!this.turning) return false;
    const { target, facing } = this.turning;
    this.turning = null;
    this.onIntent(target.turned(facing));
    return true;
  }

  cancel(): boolean {
    if (!this.turning) return false;
    const { target } = this.turning;
    this.turning = null;
    this.onIntent(target.previewed(null));
    return true;
  }
}
