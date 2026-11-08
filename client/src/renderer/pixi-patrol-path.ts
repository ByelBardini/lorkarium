import { Graphics } from 'pixi.js';
import { CELL_WORLD_SIZE } from './camera';
import type { PatrolPathView } from './patrol-path-view';
import { dashesOf } from './wall-view';

// Design system tokens (client/src/index.css): the canvas cannot read CSS variables.
const GOLD_COLOR = 0xc5a46d;
const BONE_COLOR = 0xeae5da;

// Screen px. The saved route is quieter than the draft being drawn over it.
const LINE_WIDTH = 2;
const SAVED_ALPHA = 0.55;
const CLOSING_DASH: readonly [number, number] = [6, 5];
const POINT_RADIUS = 4;
const HERE_RADIUS = 6;
// Zoomed far out, a mark never grows past a share of its cell.
const MAX_MARK_SHARE = 0.25;

/** The master's patrol line on the board, at the same screen width whatever the zoom: gold legs
 *  through the centers of the token at each point, the loop's way back dashed, a dot on each
 *  point and a ring where the patrol walks now. Redrawn with the overlays (view change or a
 *  settled zoom), never per frame.
 *
 *  Example: `patrolPath.draw(view.patrolPath, camera.zoom)` */
export class PixiPatrolPath {
  readonly shape = new Graphics();

  draw(path: PatrolPathView | null, zoom: number): void {
    this.shape.clear();
    if (!path) return;
    const alpha = path.draft ? 1 : SAVED_ALPHA;
    this.drawLegs(path, zoom, alpha);
    const mark = (radius: number) => Math.min(radius / zoom, CELL_WORLD_SIZE * MAX_MARK_SHARE);
    for (const { x, y } of path.points) this.shape.circle(x, y, mark(POINT_RADIUS));
    this.shape.fill({ color: GOLD_COLOR, alpha });
    if (!path.here) return;
    this.shape.circle(path.here.x, path.here.y, mark(HERE_RADIUS));
    this.shape.stroke({ width: LINE_WIDTH / zoom, color: BONE_COLOR });
  }

  private drawLegs(path: PatrolPathView, zoom: number, alpha: number): void {
    const pattern = [CLOSING_DASH[0] / zoom, CLOSING_DASH[1] / zoom] as const;
    for (const leg of path.legs) {
      const pieces = dashesOf(leg, leg.closing ? pattern : null);
      for (const { from, to } of pieces) this.shape.moveTo(from.x, from.y).lineTo(to.x, to.y);
    }
    this.shape.stroke({ width: LINE_WIDTH / zoom, color: GOLD_COLOR, alpha, cap: 'round' });
  }
}
