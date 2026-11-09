import { Container, Graphics, Text } from 'pixi.js';
import type { RulerView } from './board-view';
import { CELL_WORLD_SIZE, type Point } from './camera';
import { dashesOf, type WallStroke } from './wall-view';

// Design system tokens (client/src/index.css): the canvas cannot read CSS variables.
const GOLD_COLOR = 0xc5a46d;
const LABEL_COLOR = 0xeae5da;
const PLATE_COLOR = 0x15181d;

// Screen px. The map can be any image, even white: the reading brings its own background.
const PLATE_ALPHA = 0.94;
const PLATE_PADDING_X = 8;
const PLATE_PADDING_Y = 3;
const PLATE_RADIUS = 4;

// Screen px. A faint solid gold band under the dashes keeps the path readable over a map image.
const TRAIL_DASH: readonly [number, number] = [8, 6];
const TRAIL_WIDTH = 2.5;
const TRAIL_BAND_WIDTH = 6;
const TRAIL_BAND_ALPHA = 0.3;
const START_RING_RADIUS = 7;
// Zoomed far out, the ring never grows past a share of its cell.
const MAX_RING_SHARE = 0.2;

type RulerTextSize = Readonly<{ width: number; height: number }>;
type RulerTextMeasure = (text: Text) => RulerTextSize;

/** The ruler on the board, at the same screen size whatever the zoom, with the reading on a dark
 *  plate at the end. A drag walks a trail through the center of each cell it passes: a faint gold band, gold
 *  dashes over it (straight runs dashed as one, so the rhythm never restarts mid-run) and a ring
 *  on the cell it left. The tool
 *  is a solid line through its two points. */
export class PixiRuler {
  readonly container = new Container();
  private readonly shape = new Graphics();
  private readonly reading = new Container();
  private readonly plate = new Graphics();
  private readonly text = new Text({
    text: '',
    style: {
      fontFamily: 'Hanken Grotesk Variable, sans-serif',
      fontWeight: '600',
      fontSize: 14,
      fill: LABEL_COLOR,
    },
  });

  /** `measureText` is replaceable because jsdom measures no text.
   *
   *  Example: `new PixiRuler()` */
  constructor(private readonly measureText: RulerTextMeasure = sizeOfRenderedText) {
    this.text.position.set(PLATE_PADDING_X, PLATE_PADDING_Y);
    this.reading.addChild(this.plate, this.text);
    this.container.addChild(this.shape, this.reading);
  }

  /** Example: `ruler.draw(view.ruler, camera.zoom)` */
  draw(ruler: RulerView | null, zoom: number): void {
    this.shape.clear();
    const last = ruler?.points.at(-1);
    this.reading.visible = Boolean(ruler && last);
    if (!ruler || !last) return;
    if (ruler.steps.length > 0) this.drawTrail(ruler.steps, zoom);
    else this.drawLine(ruler, zoom);
    this.drawReading(ruler.label);
    this.reading.scale.set(1 / zoom);
    this.reading.position.set(last.x + 12 / zoom, last.y - 32 / zoom);
  }

  private drawReading(label: string): void {
    this.text.text = label;
    const { width, height } = this.measureText(this.text);
    this.plate
      .clear()
      .roundRect(0, 0, width + PLATE_PADDING_X * 2, height + PLATE_PADDING_Y * 2, PLATE_RADIUS)
      .fill({ color: PLATE_COLOR, alpha: PLATE_ALPHA })
      .stroke({ width: 1, color: GOLD_COLOR });
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

function sizeOfRenderedText(text: Text): RulerTextSize {
  return { width: text.width, height: text.height };
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
