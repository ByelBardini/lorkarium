import {
  DRAWING_POINTS_MAX,
  type DrawingColorDto,
  type FixedShapeKindDto,
} from '@lorkarium/contracts';
import type { DrawingBox, SceneSize } from '@lorkarium/game-core';

/** A point on the board in fractional cells (x = 3.5 is the middle of the fourth column). */
export type CellPoint = Readonly<{ x: number; y: number }>;

export type DrawingKind = 'freehand' | FixedShapeKindDto;

type RelativePoint = readonly [number, number];

/** The shape of a drawing, without its style: what is drawn and what a click hits. */
export type DrawingGeometry =
  | Readonly<{
      kind: 'freehand';
      x: number;
      y: number;
      width: number;
      height: number;
      points: readonly RelativePoint[];
    }>
  | Readonly<{
      kind: FixedShapeKindDto;
      x: number;
      y: number;
      width: number;
      height: number;
      fill: DrawingColorDto | null;
    }>;

/** A sketch just finished, before any style: freehand points or the box of a fixed shape. */
export type SketchGeometry =
  | Readonly<{
      kind: 'freehand';
      x: number;
      y: number;
      width: number;
      height: number;
      points: [number, number][];
    }>
  | (Readonly<{ kind: FixedShapeKindDto }> & DrawingBox);

/** How far a freehand point may stray from the line before it counts (in cells). */
export const SIMPLIFY_TOLERANCE = 0.05;
/** How close to a line or outline a click must land to hit it (in cells). */
export const HIT_TOLERANCE = 0.15;
const SNAP_STEP = 0.5;

/** Example: `toHundredth(1.234) // 1.23` */
export function toHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A pointer past the edge is held on it, so a sketch never leaves the scene.
 *
 *  Example: `clampToScene({ x: 23, y: -1 }, { widthCells: 20, heightCells: 12 }) // { x: 20, y: 0 }` */
export function clampToScene(point: CellPoint, scene: SceneSize): CellPoint {
  return {
    x: Math.min(Math.max(point.x, 0), scene.widthCells),
    y: Math.min(Math.max(point.y, 0), scene.heightCells),
  };
}

/** The box dragged from `from` to `to`, whichever way; `snap` (Shift) puts every edge on the
 *  nearest half cell. `null` when it has no width or no height.
 *
 *  Example: `shapeBox({ x: 1, y: 1 }, { x: 3, y: 4 }, false) // { x: 1, y: 1, width: 2, height: 3 }` */
export function shapeBox(from: CellPoint, to: CellPoint, snap: boolean): DrawingBox | null {
  const round = snap ? (value: number) => Math.round(value / SNAP_STEP) * SNAP_STEP : toHundredth;
  const left = round(Math.min(from.x, to.x));
  const top = round(Math.min(from.y, to.y));
  const width = toHundredth(round(Math.max(from.x, to.x)) - left);
  const height = toHundredth(round(Math.max(from.y, to.y)) - top);
  if (width <= 0 || height <= 0) return null;
  return { x: left, y: top, width, height };
}

/** Ramer–Douglas–Peucker: the fewest points that stay within `tolerance` of the path.
 *
 *  Example: `simplifyPath(pointerSamples, SIMPLIFY_TOLERANCE)` */
export function simplifyPath(points: readonly CellPoint[], tolerance: number): CellPoint[] {
  if (points.length < 3) return [...points];
  const kept = new Set([0, points.length - 1]);
  const pending: Array<readonly [number, number]> = [[0, points.length - 1]];
  for (let span = pending.pop(); span; span = pending.pop()) {
    const [first, last] = span;
    const farthest = farthestBetween(points, first, last);
    if (!farthest || farthest.distance <= tolerance) continue;
    kept.add(farthest.index);
    pending.push([first, farthest.index], [farthest.index, last]);
  }
  return points.filter((_, index) => kept.has(index));
}

/** What a finished sketch draws: the simplified freehand path (never snapped), or the box from
 *  the first to the last point of a fixed shape. `null` when it has nothing to show.
 *
 *  Example: `sketchOf('ellipse', [press, ...moves, release], event.shiftKey)` */
export function sketchOf(
  kind: DrawingKind,
  points: readonly CellPoint[],
  snap: boolean,
): SketchGeometry | null {
  if (kind === 'freehand') return freehandOf(points);
  const first = points[0];
  const last = points.at(-1);
  const box = first && last ? shapeBox(first, last, snap) : null;
  return box && { kind, ...box };
}

/** Whether a click at `point` hits the drawing: near its line or outline, or anywhere inside a
 *  filled shape.
 *
 *  Example: `hitsDrawing(drawing, { x: 3, y: 1.1 })` */
export function hitsDrawing(
  drawing: DrawingGeometry,
  point: CellPoint,
  tolerance = HIT_TOLERANCE,
): boolean {
  if (drawing.kind === 'freehand') return nearPolyline(absolutePoints(drawing), point, tolerance);
  if (drawing.kind === 'ellipse') return hitsEllipse(drawing, point, tolerance);
  const outline =
    drawing.kind === 'rectangle' ? rectangleCorners(drawing) : triangleCorners(drawing);
  const closed = [...outline, outline[0] as CellPoint];
  if (nearPolyline(closed, point, tolerance)) return true;
  return drawing.fill !== null && insidePolygon(outline, point);
}

/** Whether a selection rectangle (in cells) touches the box; a zero-width line counts.
 *
 *  Example: `boxTouches(drawing, marqueeInCells)` */
export function boxTouches(box: DrawingBox, rect: DrawingBox): boolean {
  return (
    rect.x <= box.x + box.width &&
    rect.x + rect.width >= box.x &&
    rect.y <= box.y + box.height &&
    rect.y + rect.height >= box.y
  );
}

/** The corners of a triangle drawn in its box: apex at the top middle. */
export function triangleCorners(box: DrawingBox): CellPoint[] {
  return [
    { x: box.x + box.width / 2, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ];
}

// A path over the limit is simplified again, more coarsely, until it fits the contract.
function freehandOf(points: readonly CellPoint[]): SketchGeometry | null {
  let tolerance = SIMPLIFY_TOLERANCE;
  let simple = simplifyPath(points, tolerance);
  while (simple.length > DRAWING_POINTS_MAX) {
    tolerance *= 2;
    simple = simplifyPath(points, tolerance);
  }
  const rounded = simple.map(({ x, y }) => ({ x: toHundredth(x), y: toHundredth(y) }));
  const distinct = new Set(rounded.map(({ x, y }) => `${x},${y}`));
  if (distinct.size < 2) return null;
  const x = Math.min(...rounded.map((point) => point.x));
  const y = Math.min(...rounded.map((point) => point.y));
  const width = toHundredth(Math.max(...rounded.map((point) => point.x)) - x);
  const height = toHundredth(Math.max(...rounded.map((point) => point.y)) - y);
  const relative = rounded.map((point): [number, number] => [
    toHundredth(point.x - x),
    toHundredth(point.y - y),
  ]);
  return { kind: 'freehand', x, y, width, height, points: relative };
}

function farthestBetween(
  points: readonly CellPoint[],
  first: number,
  last: number,
): Readonly<{ index: number; distance: number }> | null {
  const start = points[first];
  const end = points[last];
  if (!start || !end) return null;
  let best: Readonly<{ index: number; distance: number }> | null = null;
  for (let index = first + 1; index < last; index += 1) {
    const point = points[index];
    if (!point) continue;
    const distance = segmentDistance(point, start, end);
    if (!best || distance > best.distance) best = { index, distance };
  }
  return best;
}

function segmentDistance(point: CellPoint, a: CellPoint, b: CellPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const along = length === 0 ? 0 : ((point.x - a.x) * dx + (point.y - a.y) * dy) / length;
  const t = Math.min(1, Math.max(0, along));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function nearPolyline(points: readonly CellPoint[], point: CellPoint, tolerance: number): boolean {
  return points.some((start, index) => {
    const end = points[index + 1];
    return end !== undefined && segmentDistance(point, start, end) <= tolerance;
  });
}

function absolutePoints(path: Extract<DrawingGeometry, { kind: 'freehand' }>): CellPoint[] {
  return path.points.map(([x, y]) => ({ x: path.x + x, y: path.y + y }));
}

function rectangleCorners(box: DrawingBox): CellPoint[] {
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  return [
    { x: box.x, y: box.y },
    { x: right, y: box.y },
    { x: right, y: bottom },
    { x: box.x, y: bottom },
  ];
}

// The radial reading of an ellipse: 1 on the outline, scaled back to cells by the short radius.
function hitsEllipse(
  ellipse: Extract<DrawingGeometry, { kind: FixedShapeKindDto }>,
  point: CellPoint,
  tolerance: number,
): boolean {
  const rx = ellipse.width / 2;
  const ry = ellipse.height / 2;
  const reach = Math.hypot((point.x - ellipse.x - rx) / rx, (point.y - ellipse.y - ry) / ry);
  const offOutline = Math.abs(reach - 1) * Math.min(rx, ry);
  if (offOutline <= tolerance) return true;
  return ellipse.fill !== null && reach <= 1;
}

// Even–odd ray casting: works for the rectangle and the triangle alike.
function insidePolygon(corners: readonly CellPoint[], point: CellPoint): boolean {
  let inside = false;
  corners.forEach((a, index) => {
    const b = corners[(index + 1) % corners.length] as CellPoint;
    const crosses = a.y > point.y !== b.y > point.y;
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  });
  return inside;
}
