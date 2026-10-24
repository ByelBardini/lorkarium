import type { SceneSize } from '@lorkarium/game-core';
import { Graphics } from 'pixi.js';
import type { BoardView } from './board-view';
import type { Camera, Size } from './camera';
import { bandRect, gridBandFor, gridLines, visibleWorldRect, type GridBand } from './grid-geometry';

// Design system tokens (client/src/index.css): the canvas cannot read CSS variables.
const SCENE_COLOR = 0x15181d;
const GOLD_COLOR = 0xc5a46d;

/** The scene's floor and its grid: the floor under everything, the grid as hairlines over the
 *  band around the view (one screen of margin), whatever the zoom. A pan inside the band leaves
 *  the lines as they are. Proven by the e2e. */
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

  drawGrid(view: BoardView, camera: Camera, screen: Size): void {
    this.band = this.bandFor(view, camera, screen);
    this.bandCells = view.grid.cells;
    this.grid.clear();
    if (!view.grid.visible) return;
    const lines = gridLines(view.grid.cells, bandRect(this.band));
    for (const x of lines.vertical) this.grid.moveTo(x, 0).lineTo(x, view.sceneSize.height);
    for (const y of lines.horizontal) this.grid.moveTo(0, y).lineTo(view.sceneSize.width, y);
    const width = 1 / camera.zoom;
    this.grid.stroke({ width, color: GOLD_COLOR, alpha: view.grid.opacity });
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
