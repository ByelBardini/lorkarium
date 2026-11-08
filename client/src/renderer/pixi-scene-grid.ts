import type { SceneSize } from '@lorkarium/game-core';
import { Graphics } from 'pixi.js';
import type { BoardView } from './board-view';
import type { Camera, Size } from './camera';
import {
  bandRect,
  gridBandFor,
  gridLines,
  visibleWorldRect,
  type GridBand,
  type WorldRect,
} from './grid-geometry';

// Design system tokens (client/src/index.css): the canvas cannot read CSS variables.
const SCENE_COLOR = 0x15181d;
const GOLD_COLOR = 0xc5a46d;

/** The scene's floor and its grid: the floor under everything, the grid as 1 px pixel lines over
 *  the band around the view (one screen of margin), whatever the zoom, so a zoom alone does not
 *  redraw it. A pan inside the band leaves the lines as they are. Proven by the e2e. */
export class PixiSceneGrid {
  readonly floor = new Graphics();
  readonly grid = new Graphics();
  private band: GridBand | null = null;
  private bandCells: SceneSize | null = null;

  drawFloor(view: BoardView): void {
    this.floor.clear().rect(0, 0, view.sceneSize.width, view.sceneSize.height).fill(SCENE_COLOR);
  }

  /** Whether the camera now shows past the band drawn: the grid needs a redraw. */
  leavesBand(view: BoardView, camera: Camera, screen: Size): boolean {
    return this.bandFor(view, camera, screen) !== this.band;
  }

  /** The band drawn last, in world px; `null` before the first draw.
   *
   *  Example: `overlays.draw(view, camera.zoom, grid.bandWorld() ?? visible)` */
  bandWorld(): WorldRect | null {
    return this.band && bandRect(this.band);
  }

  /** Draws the grid over the band; `fresh` works the band out anew around the view (a settled
   *  zoom in must shrink it), otherwise the band drawn stays while it still covers the view.
   *
   *  Example: `grid.drawGrid(view, camera, screen, zoomSettled)` */
  drawGrid(view: BoardView, camera: Camera, screen: Size, fresh = false): void {
    if (fresh) this.band = null;
    this.band = this.bandFor(view, camera, screen);
    this.bandCells = view.grid.cells;
    this.grid.clear();
    if (!view.grid.visible) return;
    const lines = gridLines(view.grid.cells, bandRect(this.band));
    for (const x of lines.vertical) this.grid.moveTo(x, 0).lineTo(x, view.sceneSize.height);
    for (const y of lines.horizontal) this.grid.moveTo(0, y).lineTo(view.sceneSize.width, y);
    this.grid.stroke({ width: 1, pixelLine: true, color: GOLD_COLOR, alpha: view.grid.opacity });
  }

  private bandFor(view: BoardView, camera: Camera, screen: Size): GridBand {
    const { widthCells, heightCells } = view.grid.cells;
    const drawn = this.bandCells;
    const sameScene = drawn?.widthCells === widthCells && drawn.heightCells === heightCells;
    return gridBandFor(
      view.grid.cells,
      visibleWorldRect(camera, screen),
      sameScene ? this.band : null,
    );
  }
}
