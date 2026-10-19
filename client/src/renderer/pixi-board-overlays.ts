import type { Container } from 'pixi.js';
import type { BoardIntentListener } from './board-renderer';
import type { BoardView } from './board-view';
import type { Point } from './camera';
import { PixiFacingHandle } from './pixi-facing-handle';
import { PixiLightLayer } from './pixi-light-layer';
import { PixiMarquee } from './pixi-marquee';
import { PixiResizeHandles } from './pixi-resize-handles';
import { PixiRuler } from './pixi-ruler';
import { PixiWallLayer } from './pixi-wall-layer';

/** What the board draws above the fog, in drawing order: what the master's lights light, the walls,
 *  the light icons and the doors, the handles of
 *  the selected token, the sketches of the tools (passed in), the ruler and the marquee. Redrawn on
 *  every camera change, since their lines keep their width on screen. Proven by the e2e.
 *
 *  Example: `world.addChild(...overlays.containers([drawings.draft, effectAreas.draft]))` */
export class PixiBoardOverlays {
  readonly walls = new PixiWallLayer();
  readonly lights = new PixiLightLayer();
  readonly facingHandle: PixiFacingHandle;
  readonly resizeHandles: PixiResizeHandles;
  readonly ruler = new PixiRuler();
  readonly marquee: PixiMarquee;

  constructor(onIntent: BoardIntentListener) {
    this.facingHandle = new PixiFacingHandle(onIntent);
    this.resizeHandles = new PixiResizeHandles(onIntent);
    this.marquee = new PixiMarquee(onIntent);
  }

  /** The containers to add to the world above the fog, the tools' sketches in the middle. */
  containers(sketches: readonly Container[]): Container[] {
    const { walls, lights, resizeHandles, facingHandle, ruler, marquee } = this;
    return [
      lights.areas,
      walls.lines,
      lights.icons,
      walls.doors,
      resizeHandles.shape,
      facingHandle.shape,
      ...sketches,
      ruler.container,
      marquee.shape,
    ];
  }

  draw(view: BoardView, zoom: number): void {
    this.walls.draw(view.walls, view.doors, zoom);
    this.lights.draw(view.lights, zoom);
    this.ruler.draw(view, zoom);
    this.resizeHandles.draw(view, zoom);
    this.facingHandle.draw(view, zoom);
  }

  /** A handle being dragged takes the pointer; `false` when none is. */
  move(world: Point, snap: boolean): boolean {
    return this.facingHandle.move(world, snap) || this.resizeHandles.move(world, snap);
  }

  release(): boolean {
    return this.facingHandle.release() || this.resizeHandles.release();
  }

  cancel(): boolean {
    return this.facingHandle.cancel() || this.resizeHandles.cancel();
  }
}
