import { Graphics } from 'pixi.js';
import type { BoardIntentListener } from './board-renderer';
import type { BoardView, TokenView } from './board-view';
import type { Point } from './camera';
import { facingFromDrag, handleAt, handleStemOf, handleTokenOf } from './facing-handle';

// Design system token (client/src/index.css): the canvas cannot read CSS variables.
const GOLD_COLOR = 0xc5a46d;
const HANDLE_SIDE = 10;

type Turning = { token: TokenView; facing: number };

/** The handle of the one selected token: a line from its edge to a small square where it
 *  looks. Dragging the square turns the token (Shift snaps to 45°): this viewer sees it at once,
 *  the turn is sent on release and Esc lets go without turning. */
export class PixiFacingHandle {
  readonly shape = new Graphics();
  private turning: Turning | null = null;

  constructor(private readonly onIntent: BoardIntentListener) {}

  /** Hairlines whatever the zoom, like the grid. */
  draw(view: BoardView, zoom: number): void {
    this.shape.clear();
    const token = handleTokenOf(view);
    if (!token) return;
    const { from, to: handle } = handleStemOf(token);
    const half = HANDLE_SIDE / 2 / zoom;
    this.shape.moveTo(from.x, from.y).lineTo(handle.x, handle.y);
    this.shape.stroke({ width: 1.5 / zoom, color: GOLD_COLOR });
    this.shape.rect(handle.x - half, handle.y - half, half * 2, half * 2).fill(GOLD_COLOR);
  }

  /** A press on the handle starts turning (and wins over the token under it). */
  press(view: BoardView, world: Point): boolean {
    const token = handleTokenOf(view);
    if (!token || !handleAt(token, world)) return false;
    this.turning = { token, facing: token.facing };
    return true;
  }

  move(world: Point, snap: boolean): boolean {
    if (!this.turning) return false;
    const { token, facing } = this.turning;
    const next = facingFromDrag(token, world, facing, snap);
    if (next === facing) return true;
    this.turning = { token, facing: next };
    this.onIntent({ kind: 'tokenFacingPreviewed', tokenId: token.id, facing: next });
    return true;
  }

  release(): boolean {
    if (!this.turning) return false;
    const { token, facing } = this.turning;
    this.turning = null;
    this.onIntent({ kind: 'tokenFaced', tokenId: token.id, facing });
    return true;
  }

  cancel(): boolean {
    if (!this.turning) return false;
    const { token } = this.turning;
    this.turning = null;
    this.onIntent({ kind: 'tokenFacingPreviewed', tokenId: token.id, facing: null });
    return true;
  }
}
