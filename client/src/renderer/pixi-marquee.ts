import { Graphics } from 'pixi.js';
import type { BoardIntentListener } from './board-renderer';
import type { BoardView } from './board-view';
import type { Point } from './camera';
import {
  marqueeRect,
  marqueeTargetsOf,
  moveMarquee,
  startMarquee,
  type Marquee,
  type WorldRect,
} from './marquee';

// Design system token (client/src/index.css): the canvas cannot read CSS variables.
const GOLD_COLOR = 0xc5a46d;
const DASH_SCREEN_PX = 6;

/** The selection rectangle of a press on the empty board with Selecionar (or the draw tool in
 *  Selecionar, for drawings only): it grows with the
 *  pointer (from 4 px) and, on release, reports what it touches; Shift adds to the selection. */
export class PixiMarquee {
  readonly shape = new Graphics();
  private marquee: Marquee | null = null;

  constructor(private readonly onIntent: BoardIntentListener) {}

  start(screen: Point, world: Point): void {
    this.marquee = startMarquee(screen, world);
  }

  /** Whether a marquee took the move. */
  grow(screen: Point, world: Point, zoom: number): boolean {
    if (!this.marquee) return false;
    this.marquee = moveMarquee(this.marquee, { screen, world });
    this.shape.clear();
    if (this.marquee.active) drawMarqueeShape(this.shape, marqueeRect(this.marquee), zoom);
    return true;
  }

  end(view: BoardView | null, additive: boolean): void {
    const current = this.marquee;
    this.marquee = null;
    this.shape.clear();
    if (!current?.active || !view) return;
    const { tokenIds, drawingIds, effectAreaIds } = marqueeTargetsOf(marqueeRect(current), view);
    // The tokens go first: without Shift, their intent drops the whole old selection.
    this.onIntent({ kind: 'tokensMarqueed', tokenIds, additive });
    this.onIntent({ kind: 'drawingsMarqueed', drawingIds, additive });
    this.onIntent({ kind: 'effectAreasMarqueed', effectAreaIds, additive });
  }
}

/** Draws the selection rectangle: dashed gold hairline and a faint fill, the same on screen
 *  whatever the zoom. Proven by the e2e, like the rest of the PixiJS shell.
 *
 *  Example: `drawMarqueeShape(shape, marqueeRect(marquee), camera.zoom)` */
export function drawMarqueeShape(shape: Graphics, rect: WorldRect, zoom: number): void {
  shape.clear();
  for (const [from, to] of edgesOf(rect)) dashedLine(shape, from, to, DASH_SCREEN_PX / zoom);
  shape.stroke({ width: 1 / zoom, color: GOLD_COLOR });
  shape.rect(rect.x, rect.y, rect.width, rect.height).fill({ color: GOLD_COLOR, alpha: 0.06 });
}

function edgesOf({ x, y, width, height }: WorldRect): Array<readonly [Point, Point]> {
  const topLeft = { x, y };
  const topRight = { x: x + width, y };
  const bottomRight = { x: x + width, y: y + height };
  const bottomLeft = { x, y: y + height };
  return [
    [topLeft, topRight],
    [topRight, bottomRight],
    [bottomRight, bottomLeft],
    [bottomLeft, topLeft],
  ];
}

// PixiJS 8 has no dashed stroke: the dashes are drawn one by one.
function dashedLine(shape: Graphics, from: Point, to: Point, dash: number): void {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.floor(length / dash));
  for (let index = 0; index < steps; index += 2) {
    const start = index / steps;
    const end = Math.min(1, (index + 1) / steps);
    shape.moveTo(from.x + (to.x - from.x) * start, from.y + (to.y - from.y) * start);
    shape.lineTo(from.x + (to.x - from.x) * end, from.y + (to.y - from.y) * end);
  }
}
