import { Container, Graphics, Text } from 'pixi.js';
import type { BoardView } from './board-view';

// Design system tokens (client/src/index.css): the canvas cannot read CSS variables.
const GOLD_COLOR = 0xc5a46d;
const LABEL_COLOR = 0xd5d0c4;

/** The ruler on the board: a line through each point (the bends of a drag), a dot on every bend
 *  and the reading at the end, all at the same screen size whatever the zoom. */
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

  /** Example: `ruler.draw(view, camera.zoom)` */
  draw(view: BoardView, zoom: number): void {
    this.shape.clear();
    const points = view.ruler?.points ?? [];
    const [first, ...rest] = points;
    const last = points.at(-1);
    this.text.visible = Boolean(view.ruler && first && last);
    if (!view.ruler || !first || !last) return;
    this.shape.moveTo(first.x, first.y);
    for (const point of rest) this.shape.lineTo(point.x, point.y);
    this.shape.stroke({ width: 2 / zoom, color: GOLD_COLOR });
    for (const bend of points.slice(1, -1)) this.shape.circle(bend.x, bend.y, 4 / zoom);
    this.shape.fill(GOLD_COLOR);
    this.text.text = view.ruler.label;
    this.text.scale.set(1 / zoom);
    this.text.position.set(last.x + 12 / zoom, last.y - 24 / zoom);
  }
}
