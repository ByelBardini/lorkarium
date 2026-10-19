import type { SceneSize } from '@lorkarium/game-core';
import type { BoardIntentListener } from './board-renderer';
import { CELL_WORLD_SIZE, type Point } from './camera';

// Past this many screen px a press is a drag, not a click.
const DRAG_THRESHOLD = 4;

type LightPress = Readonly<{
  scene: SceneSize;
  screen: Point;
  world: Point;
  lightId: string | null;
  dragging: boolean;
}>;

/** The press of the lights tool, without PixiJS. On the empty board a click puts a light at the
 *  point pressed; a drag that starts there puts nothing. On an icon a click picks the light (Shift
 *  toggles it) and a drag from 4 px shows where it goes and drops it there. Points go to the
 *  hundredth (Shift: to the half cell) and stay inside the scene. Esc puts a dragged light back.
 *
 *  Example: `gestures.press(view.grid.cells, screen, world, null); gestures.release(screen, world, event.shiftKey)` */
export class LightGestures {
  private held: LightPress | null = null;

  constructor(private readonly onIntent: BoardIntentListener) {}

  /** `scene` in cells (the view's `grid.cells`); `lightId` is the light under the press, if any. */
  press(scene: SceneSize, screen: Point, world: Point, lightId: string | null): void {
    this.held = { scene, screen, world, lightId, dragging: false };
  }

  /** Answers whether a held press took the pointer. */
  move(screen: Point, world: Point, snap: boolean): boolean {
    const held = this.held;
    if (!held) return false;
    const moved = Math.hypot(screen.x - held.screen.x, screen.y - held.screen.y);
    if (moved >= DRAG_THRESHOLD) this.held = { ...held, dragging: true };
    if (!this.held?.dragging || held.lightId === null) return true;
    const point = cellPointOf(world, snap);
    if (insideScene(point, held.scene)) {
      this.onIntent({ kind: 'lightMovePreviewed', lightId: held.lightId, point });
    }
    return true;
  }

  /** Answers whether a held press took the pointer. */
  release(_screen: Point, world: Point, snap: boolean): boolean {
    const held = this.held;
    this.held = null;
    if (!held) return false;
    if (held.lightId === null) return this.placeAt(held, snap);
    if (!held.dragging) {
      this.onIntent({ kind: 'lightPicked', lightId: held.lightId, additive: snap });
      return true;
    }
    return this.dropAt(held.lightId, held.scene, cellPointOf(world, snap));
  }

  cancel(): boolean {
    const held = this.held;
    this.held = null;
    if (held?.dragging && held.lightId !== null) {
      this.onIntent({ kind: 'lightMovePreviewed', lightId: held.lightId, point: null });
    }
    return held !== null;
  }

  private placeAt(held: LightPress, snap: boolean): boolean {
    if (held.dragging) return true;
    const point = cellPointOf(held.world, snap);
    if (insideScene(point, held.scene)) this.onIntent({ kind: 'lightPlaced', ...point });
    return true;
  }

  // Dropped past the edge, the light goes back where it was.
  private dropAt(lightId: string, scene: SceneSize, point: Point): boolean {
    if (insideScene(point, scene)) this.onIntent({ kind: 'lightDropped', lightId, ...point });
    else this.onIntent({ kind: 'lightMovePreviewed', lightId, point: null });
    return true;
  }
}

/** A world point in fractional cells: to the hundredth, or to the half cell with Shift.
 *
 *  Example: `cellPointOf({ x: 5.37 * CELL, y: 3.12 * CELL }, true)` → `{ x: 5.5, y: 3 }` */
export function cellPointOf(world: Point, snap: boolean): Point {
  const step = snap ? 2 : 100;
  const round = (px: number): number => Math.round((px / CELL_WORLD_SIZE) * step) / step;
  return { x: round(world.x), y: round(world.y) };
}

function insideScene({ x, y }: Point, scene: SceneSize): boolean {
  return x >= 0 && y >= 0 && x <= scene.widthCells && y <= scene.heightCells;
}
