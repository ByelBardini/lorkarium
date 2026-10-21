import { Graphics } from 'pixi.js';
import type { SightConeView } from './sight-cone-view';

// Design system token (client/src/index.css): the canvas cannot read CSS variables.
const GOLD = 0xc5a46d;
const OUTLINE_SCREEN_PX = 1.5;
const OUTLINE_ALPHA = 0.6;
const FILL_ALPHA = 0.06;

/** The master's outline of the field of view of the token selected alone: a faint gold fill and a
 *  gold hairline, above the fog and below the wall lines. Redrawn only when the outline or the zoom
 *  changes. Proven by the e2e.
 *
 *  Example: `world.addChild(cone.shape); cone.draw(view.sightCone, camera.zoom)` */
export class PixiSightConeLayer {
  readonly shape = new Graphics();
  private drawn: string | null = null;

  draw(view: SightConeView | null, zoom: number): void {
    const key = view ? `${view.key}@${zoom}` : null;
    if (key === this.drawn) return;
    this.drawn = key;
    this.shape.clear();
    if (!view || view.outline.length < 3) return;
    const points = view.outline.flatMap(({ x, y }) => [x, y]);
    this.shape
      .poly(points)
      .fill({ color: GOLD, alpha: FILL_ALPHA })
      .stroke({ width: OUTLINE_SCREEN_PX / zoom, color: GOLD, alpha: OUTLINE_ALPHA });
  }
}
