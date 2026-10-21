import type { SceneDto } from '@lorkarium/contracts';
import { effectAreaCells, type EffectArea, type SceneSize } from '@lorkarium/game-core';
import { toHundredth } from '@/lib/drawing-geometry';
import { effectAreaLabel } from '@/lib/effect-area-label';
import { sentShapeOf } from '@/lib/effect-area-shape';
import { effectAreaSketchOf, type AreaFootprint } from '@/lib/effect-area-sketch';
import type { EffectAreaStyle } from '@/lib/effect-area-style';
import type { BoardIntentListener } from './board-renderer';
import type { BoardView } from './board-view';
import { CELL_WORLD_SIZE, type Point } from './camera';
import { selectedAreaIdsOf } from './drawing-gestures';
import { topEffectAreaAt, type EffectAreaView } from './effect-area-view';
import { movePress, pressToken, releasePress, type TokenPress } from './token-drag';

/** With the area tool on: the style of the next area and the scene's distance for its size. */
export type EffectAreaSketchView = Readonly<{
  style: EffectAreaStyle;
  distance: Pick<SceneDto, 'cellDistance' | 'cellUnit'>;
}>;

/** What the area gestures ask of the canvas: show the area being drawn (`null` clears it),
 *  follow a drag of areas and put them back. */
export interface EffectAreaCanvas {
  showDraft(view: EffectAreaView | null): void;
  dragBy(effectAreaIds: readonly string[], offset: Point): void;
  release(): void;
}

type AreaPress = Readonly<{
  press: TokenPress;
  effectAreaIds: readonly string[];
  startWorld: Point;
}>;

type Sketch = Readonly<{
  sketch: EffectAreaSketchView;
  scene: SceneSize;
  press: Point;
  footprints: readonly AreaFootprint[];
}> & { area: EffectArea | null };

const DRAFT_ID = 'draft';

/** The pointer on areas of effect, apart from the PixiJS shell. With the area tool, a press is
 *  where the area is born, the drag shows it with its size and the release reports its shape.
 *  With Selecionar, a press on a pickable area picks it or (from 4 px) drags it with the other
 *  areas selected (the tokens selected follow from the drop). Esc lets go of either.
 *
 *  Example: `const areas = new EffectAreaGestures(areaLayer, onIntent)` */
export class EffectAreaGestures {
  private drawing: Sketch | null = null;
  private pressed: AreaPress | null = null;

  constructor(
    private readonly canvas: EffectAreaCanvas,
    private readonly emit: BoardIntentListener,
  ) {}

  /** A primary press with the area tool, at `world` px. */
  startSketch(view: BoardView, world: Point): void {
    if (!view.effectAreaSketch) return;
    const footprints = view.tokens
      .filter((token) => token.pickable)
      .map(({ col, row, width, height }) => ({ x: col, y: row, width, height }));
    const press = cellsOf(world);
    this.drawing = {
      sketch: view.effectAreaSketch,
      scene: view.grid.cells,
      press,
      footprints,
      area: null,
    };
  }

  /** A primary press with Selecionar on no token: whether an area took it. */
  press(view: BoardView, screen: Point, world: Point): boolean {
    const hit = topEffectAreaAt(view.effectAreas, world);
    if (!hit) return false;
    const others = hit.selected ? selectedAreaIdsOf(view).filter((id) => id !== hit.id) : [];
    const press = pressToken(hit.id, true, screen);
    this.pressed = { press, effectAreaIds: [hit.id, ...others], startWorld: world };
    return true;
  }

  /** Whether the move belonged to an area being drawn or dragged. */
  move(screen: Point, world: Point, snap: boolean): boolean {
    if (this.pressed) return this.drag(screen, world);
    if (!this.drawing) return false;
    const { sketch, press, footprints } = this.drawing;
    const area = effectAreaSketchOf({
      style: sketch.style,
      press,
      pointer: cellsOf(world),
      snap,
      footprints,
    });
    this.drawing.area = area;
    this.canvas.showDraft(area && draftOf(area, this.drawing));
    return true;
  }

  release(screen: Point, world: Point, snap: boolean): boolean {
    if (this.pressed) return this.drop(world, snap);
    if (!this.drawing) return false;
    this.move(screen, world, snap);
    const { area, sketch } = this.drawing;
    this.drawing = null;
    this.canvas.showDraft(null);
    if (area)
      this.emit({ kind: 'effectAreaSketched', shape: sentShapeOf(area, sketch.style.color) });
    return true;
  }

  cancel(): boolean {
    if (this.pressed) {
      this.pressed = null;
      this.canvas.release();
      return true;
    }
    if (!this.drawing) return false;
    this.drawing = null;
    this.canvas.showDraft(null);
    return true;
  }

  private drag(screen: Point, world: Point): boolean {
    if (!this.pressed) return false;
    const { press, dragging } = movePress(this.pressed.press, screen);
    this.pressed = { ...this.pressed, press };
    if (dragging) this.canvas.dragBy(this.pressed.effectAreaIds, offsetOf(this.pressed, world));
    return true;
  }

  private drop(world: Point, snap: boolean): boolean {
    const pressed = this.pressed;
    if (!pressed) return false;
    this.pressed = null;
    const anchorId = pressed.press.tokenId;
    if (releasePress(pressed.press) === 'pick') {
      this.emit({ kind: 'effectAreaPicked', effectAreaId: anchorId, additive: snap });
      return true;
    }
    this.canvas.release();
    const offset = offsetOf(pressed, world);
    const dx = toHundredth(offset.x / CELL_WORLD_SIZE);
    const dy = toHundredth(offset.y / CELL_WORLD_SIZE);
    // Drawings are never selected with Selecionar (they have their own layer): none goes along.
    const { effectAreaIds } = pressed;
    this.emit({ kind: 'drawingsDropped', anchorId, drawingIds: [], effectAreaIds, dx, dy });
    return true;
  }
}

function offsetOf(pressed: AreaPress, world: Point): Point {
  return { x: world.x - pressed.startWorld.x, y: world.y - pressed.startWorld.y };
}

function draftOf(area: EffectArea, { sketch, scene }: Sketch): EffectAreaView {
  const cells = effectAreaCells(scene, area);
  const label = effectAreaLabel(area, sketch.distance);
  return {
    id: DRAFT_ID,
    area,
    color: sketch.style.color,
    cells,
    pickable: false,
    selected: false,
    label,
  };
}

function cellsOf(world: Point): Point {
  return { x: world.x / CELL_WORLD_SIZE, y: world.y / CELL_WORLD_SIZE };
}
