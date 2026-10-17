import type { TokenLayerDto } from '@lorkarium/contracts';
import { Container, Graphics, type StrokeStyle } from 'pixi.js';
import { triangleCorners, type DrawingGeometry } from '@/lib/drawing-geometry';
import { drawingColorValue, strokeWorldPx, type DrawingStyle } from '@/lib/drawing-style';
import { CELL_WORLD_SIZE, type Point } from './camera';
import type { DrawingCanvas, SketchFrame } from './drawing-gestures';
import type { DrawingView } from './drawing-view';
import { drawMarqueeShape } from './pixi-marquee';

const FILL_ALPHA = 0.35;
const SELECTION_MARGIN_PX = 6;

type ShapeSprite = { root: Container; shape: Graphics; selection: Graphics; view: DrawingView };

type Paint = Pick<DrawingStyle, 'stroke' | 'strokeWidth'>;

/** The drawings on the canvas: one sprite per drawing, kept by id and redrawn only when its
 *  confirmed drawing or its selection changes (a move only shifts it), inside one `Container` per
 *  layer that the token layer puts under the tokens of that layer. Proven by the e2e. */
export class PixiDrawingLayer implements DrawingCanvas {
  readonly layers: Readonly<Record<TokenLayerDto, Container>> = {
    background: new Container(),
    objects: new Container(),
    tokens: new Container(),
  };
  /** The sketch under the pointer, drawn over everything. */
  readonly draft = new Graphics();
  private readonly sprites = new Map<string, ShapeSprite>();

  sync(drawings: readonly DrawingView[]): void {
    const alive = new Set(drawings.map(({ id }) => id));
    for (const [id, sprite] of this.sprites) {
      if (alive.has(id)) continue;
      sprite.root.destroy({ children: true });
      this.sprites.delete(id);
    }
    drawings.forEach((view) => this.place(view));
  }

  dragBy(drawingIds: readonly string[], offset: Point): void {
    for (const id of drawingIds) {
      const sprite = this.sprites.get(id);
      if (!sprite) continue;
      const corner = cornerOf(sprite.view.geometry);
      sprite.root.position.set(corner.x + offset.x, corner.y + offset.y);
    }
  }

  /** Back to the confirmed corner: the preview or the confirmed event shows where it goes. */
  release(): void {
    for (const { root, view } of this.sprites.values()) {
      const corner = cornerOf(view.geometry);
      root.position.set(corner.x, corner.y);
    }
  }

  showSketch(frame: SketchFrame | null): void {
    this.draft.clear();
    if (!frame) return;
    const geometry: DrawingGeometry =
      frame.geometry.kind === 'freehand'
        ? frame.geometry
        : { ...frame.geometry, fill: frame.style.fill };
    const corner = cornerOf(geometry);
    this.draft.position.set(corner.x, corner.y);
    drawShape(this.draft, geometry, frame.style);
  }

  destroy(): void {
    for (const layer of Object.values(this.layers)) layer.destroy({ children: true });
    this.draft.destroy();
    this.sprites.clear();
  }

  private place(view: DrawingView): void {
    const known = this.sprites.get(view.id);
    const sprite = known ?? this.add(view);
    const parent = this.layers[view.layer];
    if (sprite.root.parent !== parent) parent.addChild(sprite.root);
    const corner = cornerOf(view.geometry);
    sprite.root.position.set(corner.x, corner.y);
    const changed =
      !known || known.view.source !== view.source || known.view.selected !== view.selected;
    sprite.view = view;
    if (changed) redraw(sprite);
  }

  private add(view: DrawingView): ShapeSprite {
    const root = new Container();
    const shape = new Graphics();
    const selection = new Graphics();
    root.addChild(shape, selection);
    const sprite = { root, shape, selection, view };
    this.sprites.set(view.id, sprite);
    return sprite;
  }
}

function redraw({ shape, selection, view }: ShapeSprite): void {
  shape.clear();
  drawShape(shape, view.geometry, view);
  selection.clear();
  if (!view.selected) return;
  const width = view.geometry.width * CELL_WORLD_SIZE + 2 * SELECTION_MARGIN_PX;
  const height = view.geometry.height * CELL_WORLD_SIZE + 2 * SELECTION_MARGIN_PX;
  const box = { x: -SELECTION_MARGIN_PX, y: -SELECTION_MARGIN_PX, width, height };
  drawMarqueeShape(selection, box, 1);
}

// Shapes are drawn from (0, 0), the corner of their box; their sprite sits at that corner.
function drawShape(graphics: Graphics, geometry: DrawingGeometry, paint: Paint): void {
  const color = drawingColorValue(paint.stroke);
  const width = strokeWorldPx(paint.strokeWidth);
  const stroke: StrokeStyle = { width, color, cap: 'round', join: 'round' };
  if (geometry.kind === 'freehand') {
    const [first, ...rest] = geometry.points;
    if (!first) return;
    graphics.moveTo(first[0] * CELL_WORLD_SIZE, first[1] * CELL_WORLD_SIZE);
    for (const [x, y] of rest) graphics.lineTo(x * CELL_WORLD_SIZE, y * CELL_WORLD_SIZE);
    graphics.stroke(stroke);
    return;
  }
  outline(graphics, geometry);
  if (geometry.fill) graphics.fill({ color: drawingColorValue(geometry.fill), alpha: FILL_ALPHA });
  graphics.stroke(stroke);
}

function outline(
  graphics: Graphics,
  geometry: Exclude<DrawingGeometry, { kind: 'freehand' }>,
): void {
  const width = geometry.width * CELL_WORLD_SIZE;
  const height = geometry.height * CELL_WORLD_SIZE;
  if (geometry.kind === 'rectangle') return void graphics.rect(0, 0, width, height);
  if (geometry.kind === 'ellipse') {
    return void graphics.ellipse(width / 2, height / 2, width / 2, height / 2);
  }
  const corners = triangleCorners({ x: 0, y: 0, width, height });
  graphics.poly(corners.flatMap(({ x, y }) => [x, y]));
}

function cornerOf(geometry: Pick<DrawingGeometry, 'x' | 'y'>): Point {
  return { x: geometry.x * CELL_WORLD_SIZE, y: geometry.y * CELL_WORLD_SIZE };
}
