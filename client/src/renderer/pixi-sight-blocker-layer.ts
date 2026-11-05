import { Graphics } from 'pixi.js';
import {
  sightBlockerOutlineDashesOf,
  type SightBlockerOutlineView,
} from './sight-blocker-outline-view';

// Design system token (client/src/index.css): the canvas cannot read CSS variables.
const GOLD = 0xc5a46d;
const LINE_SCREEN_PX = 1.5;
const LINE_ALPHA = 0.95;

/** The master's dashed line around the shape of the blocker selected alone: above the fog, beside
 *  the outline of the field of view. Redrawn only when the view or the zoom changes (rule 5 of
 *  `performance.md`); a pan does not touch it.
 *
 *  Example: `world.addChild(blocker.shape); blocker.draw(view.sightBlockerOutline, camera.zoom)` */
export class PixiSightBlockerLayer {
  readonly shape = new Graphics();
  private drawn: SightBlockerOutlineView | null = null;
  private drawnZoom = 0;

  draw(view: SightBlockerOutlineView | null, zoom: number): void {
    if (view === this.drawn && (!view || zoom === this.drawnZoom)) return;
    this.drawn = view;
    this.drawnZoom = zoom;
    this.shape.clear();
    if (!view) return;
    for (const { from, to } of sightBlockerOutlineDashesOf(view, zoom)) {
      this.shape.moveTo(from.x, from.y).lineTo(to.x, to.y);
    }
    this.shape.stroke({ width: LINE_SCREEN_PX / zoom, color: GOLD, alpha: LINE_ALPHA });
  }
}
