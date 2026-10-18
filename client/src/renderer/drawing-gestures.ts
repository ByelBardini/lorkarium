import {
  clampToScene,
  sketchOf,
  toHundredth,
  type CellPoint,
  type SketchGeometry,
} from '@/lib/drawing-geometry';
import type { DrawingStyle } from '@/lib/drawing-style';
import type { BoardIntentListener } from './board-renderer';
import type { BoardView } from './board-view';
import { CELL_WORLD_SIZE, type Point } from './camera';
import { topDrawingAt } from './drawing-view';
import { movePress, pressToken, releasePress, type TokenPress } from './token-drag';

/** A sketch as drawn under the pointer: its shape so far and the style it will have. */
export type SketchFrame = Readonly<{ geometry: SketchGeometry; style: DrawingStyle }>;

/** What the gestures ask of the canvas: follow a drag, put it back, show the sketch (`null`
 *  clears it). */
export interface DrawingCanvas {
  dragBy(drawingIds: readonly string[], offset: Point): void;
  release(): void;
  showSketch(frame: SketchFrame | null): void;
}

type DrawingPress = Readonly<{
  press: TokenPress;
  drawingIds: readonly string[];
  effectAreaIds: readonly string[];
  startWorld: Point;
}>;

type Sketch = Readonly<{
  style: DrawingStyle;
  scene: BoardView['grid']['cells'];
  points: readonly CellPoint[];
}>;

// Pointer samples closer than this add nothing to a freehand line (cells).
const MIN_SAMPLE_STEP = 0.02;

/** The pointer on drawings, apart from the PixiJS shell: a press on a pickable drawing picks
 *  it or (from 4 px) drags it with the other selected drawings; with the draw tool, a press
 *  starts a sketch that follows the pointer and is reported on release. Esc cancels either.
 *
 *  Example: `const gestures = new DrawingGestures(drawingLayer, onIntent)` */
export class DrawingGestures {
  private pressed: DrawingPress | null = null;
  private sketch: Sketch | null = null;

  constructor(
    private readonly canvas: DrawingCanvas,
    private readonly emit: BoardIntentListener,
  ) {}

  /** A primary press with the select tool on no token: whether a drawing took it. */
  press(view: BoardView, screen: Point, world: Point): boolean {
    const hit = topDrawingAt(view.drawings, world);
    if (!hit) return false;
    const carried = view.drawings.filter((other) => other.selected && other.pickable);
    const others = hit.selected ? carried.map(({ id }) => id).filter((id) => id !== hit.id) : [];
    const press = pressToken(hit.id, true, screen);
    const effectAreaIds = hit.selected ? selectedAreaIdsOf(view) : [];
    this.pressed = { press, drawingIds: [hit.id, ...others], effectAreaIds, startWorld: world };
    return true;
  }

  /** A primary press with the draw tool: a sketch starts at the pointer. */
  startSketch(view: BoardView, world: Point): void {
    if (!view.sketch) return;
    const scene = view.grid.cells;
    this.sketch = { style: view.sketch, scene, points: [cellPointOf(world, scene)] };
    this.show(false);
  }

  /** Whether the move belonged to a drawing press or a sketch. */
  move(screen: Point, world: Point, snap: boolean): boolean {
    if (this.sketch) return this.extendSketch(world, snap);
    if (!this.pressed) return false;
    const { press, dragging } = movePress(this.pressed.press, screen);
    this.pressed = { ...this.pressed, press };
    if (dragging) this.canvas.dragBy(this.pressed.drawingIds, offsetOf(this.pressed, world));
    return true;
  }

  /** Whether the release ended a drawing press or a sketch, and reports what it was. */
  release(world: Point, snap: boolean): boolean {
    if (this.sketch) return this.finishSketch(snap);
    const pressed = this.pressed;
    if (!pressed) return false;
    this.pressed = null;
    const drawingId = pressed.press.tokenId;
    if (releasePress(pressed.press) === 'pick') {
      this.emit({ kind: 'drawingPicked', drawingId, additive: snap });
      return true;
    }
    this.canvas.release();
    const offset = offsetOf(pressed, world);
    const dx = toHundredth(offset.x / CELL_WORLD_SIZE);
    const dy = toHundredth(offset.y / CELL_WORLD_SIZE);
    const { drawingIds, effectAreaIds } = pressed;
    this.emit({ kind: 'drawingsDropped', anchorId: drawingId, drawingIds, effectAreaIds, dx, dy });
    return true;
  }

  /** Esc: whether there was a sketch or a drawing drag to drop. */
  cancel(): boolean {
    if (this.sketch) {
      this.sketch = null;
      this.canvas.showSketch(null);
      return true;
    }
    if (!this.pressed) return false;
    this.pressed = null;
    this.canvas.release();
    return true;
  }

  private extendSketch(world: Point, snap: boolean): boolean {
    if (!this.sketch) return false;
    const point = cellPointOf(world, this.sketch.scene);
    const last = this.sketch.points.at(-1);
    const moved = !last || Math.hypot(point.x - last.x, point.y - last.y) >= MIN_SAMPLE_STEP;
    if (moved) this.sketch = { ...this.sketch, points: [...this.sketch.points, point] };
    this.show(snap);
    return true;
  }

  private finishSketch(snap: boolean): boolean {
    const sketch = this.sketch;
    this.sketch = null;
    if (!sketch) return false;
    this.canvas.showSketch(null);
    this.emit({ kind: 'sketchFinished', points: sketch.points, snap });
    return true;
  }

  private show(snap: boolean): void {
    if (!this.sketch) return;
    const { style, points } = this.sketch;
    const geometry = sketchOf(style.kind, points, snap);
    this.canvas.showSketch(geometry && { geometry, style });
  }
}

/** The selected areas of effect this viewer may take: they go along with a dragged selection.
 *
 *  Example: `selectedAreaIdsOf(view) // ['a1b2…']` */
export function selectedAreaIdsOf(view: Pick<BoardView, 'effectAreas'>): string[] {
  return view.effectAreas
    .filter(({ selected, pickable }) => selected && pickable)
    .map(({ id }) => id);
}

function cellPointOf(world: Point, scene: BoardView['grid']['cells']): CellPoint {
  return clampToScene({ x: world.x / CELL_WORLD_SIZE, y: world.y / CELL_WORLD_SIZE }, scene);
}

function offsetOf(pressed: DrawingPress, world: Point): Point {
  return { x: world.x - pressed.startWorld.x, y: world.y - pressed.startWorld.y };
}
