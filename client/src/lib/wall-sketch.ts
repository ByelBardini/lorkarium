import {
  WALL_POINTS_MAX,
  type WallDto,
  type WallKindDto,
  type WallShapeDto,
} from '@lorkarium/contracts';
import type { SceneSize } from '@lorkarium/game-core';
import {
  SIMPLIFY_TOLERANCE,
  clampToScene,
  shapeBox,
  simplifyPath,
  toHundredth,
  type CellPoint,
} from './drawing-geometry';
import { wallSegmentsOf } from './wall-geometry';
import { drawnShapeOf, type WallStyle } from './wall-style';

/** An end drawn this close (in cells) to a vertex of another wall is put on it: a gap between
 *  two ends would let sight and passage through. */
export const WALL_GLUE_DISTANCE = 0.2;
const SNAP_STEP = 0.5;

export type WallSketchInput = Readonly<{
  style: WallStyle;
  /** The pointer samples of the drag, in cells. */
  points: readonly CellPoint[];
  /** Shift: the ends (or the box) go to the nearest half cell. */
  snap: boolean;
  /** The vertices of the walls already on the scene, where a near end glues. */
  vertices: readonly CellPoint[];
  scene: SceneSize;
}>;

/** The wall a drag of the walls tool draws, as `createWalls` sends it: a line from the first to
 *  the last point, a simplified freehand path (closed when it ends near its start), or the box
 *  of a rectangle or an ellipse. A door is always a line. `null` when it has no length.
 *
 *  Example: `wallSketchOf({ style, points, snap: false, vertices: wallVerticesOf(board.walls), scene })` */
export function wallSketchOf(input: WallSketchInput): WallShapeDto | null {
  const { style, snap, scene } = input;
  const points = input.points.map((point) => clampToScene(point, scene));
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;
  const shape = drawnShapeOf(style);
  if (shape === 'rectangle' || shape === 'ellipse') {
    const box = shapeBox(first, last, snap);
    return box && { kind: style.kind, shape, ...box };
  }
  const glue = (point: CellPoint): CellPoint => gluedTo(input.vertices, point);
  const placed = (point: CellPoint): CellPoint => glue(snap ? snapped(point) : rounded(point));
  if (shape === 'line') return pathShape(style.kind, 'line', [placed(first), placed(last)]);
  return pathShape(style.kind, 'freehand', closed(freehandPoints(points).map(placedEnd(glue))));
}

/** Every vertex of the walls, in cells: the ends of a line, each corner of a box (a closed
 *  outline lists its first vertex once).
 *
 *  Example: `wallVerticesOf([northWall()]) // [{ x: 2, y: 2 }, { x: 6, y: 2 }]` */
export function wallVerticesOf(walls: readonly WallDto[]): CellPoint[] {
  return walls.flatMap((dto) => {
    const segments = wallSegmentsOf(dto);
    const starts = segments.map(({ from }) => from);
    const end = segments.at(-1)?.to;
    const open = end && starts[0] && !samePoint(end, starts[0]);
    return open ? [...starts, end] : starts;
  });
}

function pathShape(
  kind: WallKindDto,
  shape: 'line' | 'freehand',
  absolute: readonly CellPoint[],
): WallShapeDto | null {
  const distinct = new Set(absolute.map(({ x, y }) => `${x},${y}`));
  if (distinct.size < 2) return null;
  const x = Math.min(...absolute.map((point) => point.x));
  const y = Math.min(...absolute.map((point) => point.y));
  const width = toHundredth(Math.max(...absolute.map((point) => point.x)) - x);
  const height = toHundredth(Math.max(...absolute.map((point) => point.y)) - y);
  const points = absolute.map((point): [number, number] => [
    toHundredth(point.x - x),
    toHundredth(point.y - y),
  ]);
  return { kind, shape, x, y, width, height, points };
}

// A path over the limit is simplified again, more coarsely, until it fits the contract.
function freehandPoints(points: readonly CellPoint[]): CellPoint[] {
  let tolerance = SIMPLIFY_TOLERANCE;
  let simple = simplifyPath(points, tolerance);
  while (simple.length > WALL_POINTS_MAX) {
    tolerance *= 2;
    simple = simplifyPath(points, tolerance);
  }
  return simple.map(rounded);
}

// Only the two ends of a freehand path glue; the points between are where they were drawn.
function placedEnd(glue: (point: CellPoint) => CellPoint) {
  return (point: CellPoint, index: number, all: readonly CellPoint[]): CellPoint =>
    index === 0 || index === all.length - 1 ? glue(point) : point;
}

function closed(points: readonly CellPoint[]): CellPoint[] {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length < 3) return [...points];
  if (Math.hypot(last.x - first.x, last.y - first.y) > WALL_GLUE_DISTANCE) return [...points];
  return [...points.slice(0, -1), first];
}

function gluedTo(vertices: readonly CellPoint[], point: CellPoint): CellPoint {
  let nearest: CellPoint | null = null;
  let distance = WALL_GLUE_DISTANCE;
  for (const vertex of vertices) {
    const away = Math.hypot(vertex.x - point.x, vertex.y - point.y);
    if (away > distance) continue;
    nearest = vertex;
    distance = away;
  }
  return nearest ? rounded(nearest) : point;
}

function snapped({ x, y }: CellPoint): CellPoint {
  return { x: Math.round(x / SNAP_STEP) * SNAP_STEP, y: Math.round(y / SNAP_STEP) * SNAP_STEP };
}

function rounded({ x, y }: CellPoint): CellPoint {
  return { x: toHundredth(x), y: toHundredth(y) };
}

function samePoint(a: CellPoint, b: CellPoint): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}
