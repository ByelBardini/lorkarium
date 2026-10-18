import { Graphics } from 'pixi.js';
import type { BoardView } from './board-view';
import type { Camera, Size } from './camera';
import { gridLines, visibleWorldRect } from './grid-geometry';

// Design system tokens (client/src/index.css): the canvas cannot read CSS variables.
const SCENE_COLOR = 0x15181d;
const GOLD_COLOR = 0xc5a46d;

/** The scene's floor and its grid: the floor under everything, the grid as hairlines drawn only
 *  where the camera looks, whatever the zoom. Proven by the e2e. */
export class PixiSceneGrid {
  readonly floor = new Graphics();
  readonly grid = new Graphics();

  drawFloor(view: BoardView): void {
    this.floor.clear().rect(0, 0, view.sceneSize.width, view.sceneSize.height).fill(SCENE_COLOR);
  }

  drawGrid(view: BoardView, camera: Camera, screen: Size): void {
    this.grid.clear();
    if (!view.grid.visible) return;
    const lines = gridLines(view.grid.cells, visibleWorldRect(camera, screen));
    for (const x of lines.vertical) this.grid.moveTo(x, 0).lineTo(x, view.sceneSize.height);
    for (const y of lines.horizontal) this.grid.moveTo(0, y).lineTo(view.sceneSize.width, y);
    const width = 1 / camera.zoom;
    this.grid.stroke({ width, color: GOLD_COLOR, alpha: view.grid.opacity });
  }
}
