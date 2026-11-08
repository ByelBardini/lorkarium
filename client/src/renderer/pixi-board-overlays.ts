import type { Container } from 'pixi.js';
import type { BoardIntentListener } from './board-renderer';
import type { BoardView } from './board-view';
import type { Point } from './camera';
import type { WorldRect } from './grid-geometry';
import { lightsInBand } from './light-view';
import { PixiFacingHandle } from './pixi-facing-handle';
import { PixiLightLayer } from './pixi-light-layer';
import { PixiMarquee } from './pixi-marquee';
import { PixiResizeHandles } from './pixi-resize-handles';
import { PixiRuler } from './pixi-ruler';
import { PixiSightBlockerLayer } from './pixi-sight-blocker-layer';
import { PixiSightConeLayer } from './pixi-sight-cone-layer';
import { PixiWallLayer } from './pixi-wall-layer';
import { doorsInBand, wallsInBand } from './wall-view';

/** What the board draws above the fog, in drawing order: what the master's lights light, the
 *  outline of the field of view and the line of the blocker selected alone, the walls,
 *  the light icons and the doors, the handles of
 *  the selected token, the sketches of the tools (passed in), the ruler and the marquee. Redrawn
 *  when the view changes, the zoom settles or the camera leaves the grid band, since their lines
 *  keep their width on screen; a pan inside the band only moves the world. Walls, doors and
 *  lights are drawn only inside the band; picking (a door click, a handle) still reads the whole
 *  view. Proven by the e2e.
 *
 *  Example: `world.addChild(...overlays.containers([drawings.draft, effectAreas.draft]))` */
export class PixiBoardOverlays {
  readonly walls = new PixiWallLayer();
  readonly lights = new PixiLightLayer();
  readonly sightCone = new PixiSightConeLayer();
  readonly sightBlocker = new PixiSightBlockerLayer();
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
    const { walls, lights, sightCone, sightBlocker } = this;
    const { resizeHandles, facingHandle, ruler, marquee } = this;
    return [
      lights.areas,
      sightCone.shape,
      sightBlocker.shape,
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

  /** Draws the view at `zoom`, the walls, doors and lights cut to `band` (world px).
   *
   *  Example: `overlays.draw(view, camera.zoom, grid.bandWorld() ?? visible)` */
  draw(view: BoardView, zoom: number, band: WorldRect): void {
    this.walls.draw(wallsInBand(view.walls, band), doorsInBand(view.doors, band), zoom);
    this.lights.draw(lightsInBand(view.lights, band), zoom);
    this.sightCone.draw(view.sightCone, zoom);
    this.sightBlocker.draw(view.sightBlockerOutline, zoom);
    this.ruler.draw(view.ruler, zoom);
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
