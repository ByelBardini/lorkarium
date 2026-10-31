import { Container, Graphics, Text } from 'pixi.js';
import type { RulerView } from './board-view';
import { CELL_WORLD_SIZE, type Point } from './camera';
import { dashesOf, type WallStroke } from './wall-view';

// Design system tokens (client/src/index.css): the canvas cannot read CSS variables.
const GOLD_COLOR = 0xc5a46d;
const LABEL_COLOR = 0xd5d0c4;

// Screen px. A faint solid gold band under the dashes keeps the path readable over a map image.
const TRAIL_DASH: readonly [number, number] = [8, 6];
const TRAIL_WIDTH = 2.5;
const TRAIL_BAND_WIDTH = 6;
const TRAIL_BAND_ALPHA = 0.3;
const START_RING_RADIUS = 7;
// Zoomed far out, the ring never grows past a share of its cell.
const MAX_RING_SHARE = 0.2;

/** The ruler on the board, at the same screen size whatever the zoom, with the reading at the
 *  end. A drag walks a trail through the center of each cell it passes: a faint gold band, gold
 *  dashes over it (straight runs dashed as one, so the rhythm never restarts mid-run) and a ring
 *  on the cell it left. The tool
 *  is a solid line through its two points. */
export class PixiRuler {
  readonly container = new Container();
  private readonly shape = new Graphics();
  private readonly text = new Text({
    text: '',
    style: { fontFamily: 'Hanken Grotesk Variable, sans-serif', fontSize: 13, fill: LABEL_COLOR },
  });

  constructor() {
    this.container.addChild(this.shape, this.text);
  }

  /** Example: `ruler.draw(view.ruler, camera.zoom)` */
  draw(ruler: RulerView | null, zoom: number): void {
    this.shape.clear();
    const last = ruler?.points.at(-1);
    this.text.visible = Boolean(ruler && last);
    if (!ruler || !last) return;
    if (ruler.steps.length > 0) this.drawTrail(ruler.steps, zoom);
    else this.drawLine(ruler, zoom);
    this.text.text = ruler.label;
    this.text.scale.set(1 / zoom);
    this.text.position.set(last.x + 12 / zoom, last.y - 24 / zoom);
  }

  private drawLine({ points }: RulerView, zoom: number): void {
    const [first, ...rest] = points;
    if (!first) return;
    this.shape.moveTo(first.x, first.y);
    for (const point of rest) this.shape.lineTo(point.x, point.y);
    this.shape.stroke({ width: 2 / zoom, color: GOLD_COLOR });
  }

  private drawTrail(steps: readonly Point[], zoom: number): void {
    const [start] = steps;
    if (!start) return;
    const runs = straightRunsOf(steps);
    for (const { from, to } of runs) this.shape.moveTo(from.x, from.y).lineTo(to.x, to.y);
    this.shape.stroke({
      width: TRAIL_BAND_WIDTH / zoom,
      color: GOLD_COLOR,
      alpha: TRAIL_BAND_ALPHA,
      cap: 'round',
    });
    const pattern = [TRAIL_DASH[0] / zoom, TRAIL_DASH[1] / zoom] as const;
    for (const run of runs) {
      for (const { from, to } of dashesOf(run, pattern))
        this.shape.moveTo(from.x, from.y).lineTo(to.x, to.y);
    }
    this.shape.stroke({ width: TRAIL_WIDTH / zoom, color: GOLD_COLOR, cap: 'round' });
    const ring = Math.min(START_RING_RADIUS / zoom, CELL_WORLD_SIZE * MAX_RING_SHARE);
    this.shape.circle(start.x, start.y, ring);
    this.shape.stroke({ width: 2 / zoom, color: GOLD_COLOR });
  }
}

// Consecutive steps in the same direction join into one run: (0,0) (1,0) (2,0) (2,1) → 2 runs.
function straightRunsOf(steps: readonly Point[]): WallStroke[] {
  const runs: WallStroke[] = [];
  steps.slice(1).forEach((to, index) => {
    const from = steps[index]!;
    const previous = runs.at(-1);
    if (previous && sameDirection(previous, { from, to }))
      runs[runs.length - 1] = { from: previous.from, to };
    else runs.push({ from, to });
  });
  return runs;
}

function sameDirection(run: WallStroke, leg: WallStroke): boolean {
  const cross =
    (run.to.x - run.from.x) * (leg.to.y - leg.from.y) -
    (run.to.y - run.from.y) * (leg.to.x - leg.from.x);
  return run.to.x === leg.from.x && run.to.y === leg.from.y && Math.abs(cross) < 1e-6;
}
