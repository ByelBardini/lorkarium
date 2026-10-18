import type { Vector2 } from './facing';
import { wallSegments, type Segment } from './wall-segments';
import { wall, type Wall, type WallPoint } from './wall.vo';

/** What is left of a wall once one of its straight pieces (`wallSegments` index) is taken out:
 *  an open path splits in two (or keeps one end), a closed outline (rectangle, ellipse, a freehand
 *  that comes back to its start) opens there. Each piece left is a line (2 vertices) or a
 *  freehand of the same kind, its vertices to the hundredth (the table keeps 0.01). A straight
 *  wall (and so a door) leaves nothing. Client and server both read it.
 *
 *  Example: `wallWithoutSegment(box, 0)` → the three other sides as one freehand */
export function wallWithoutSegment(value: Wall, segmentIndex: number): Wall[] {
  const segments = wallSegments(value);
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= segments.length) {
    throw new RangeError(
      `Wall segment ${segmentIndex} is out of range: the wall has ${segments.length} segments.`,
    );
  }
  const vertices = [segments[0]?.from, ...segments.map(({ to }) => to)].filter(isPoint);
  const paths = isClosed(vertices)
    ? [openedAt(vertices, segmentIndex)]
    : [vertices.slice(0, segmentIndex + 1), vertices.slice(segmentIndex + 1)];
  return paths.filter((path) => path.length >= 2).map((path) => wallAlong(value.kind, path));
}

/** The eraser of the walls tool, in cells: what lies inside it, edges included, goes. */
export type EraseBox = Readonly<{ x: number; y: number; width: number; height: number }>;

/** What is left of a wall outside `box`: each straight piece it covers is cut exactly at its edges,
 *  what stays joined on one side stays one wall (a closed outline opens where it was cut), each a
 *  line or freehand of the same kind as `wallWithoutSegment` leaves. `null` when the box takes
 *  nothing (touching an end point is not taking): the wall stays as it is.
 *
 *  Example: `wallOutsideBox(line0to10, { x: 3, y: -1, width: 2, height: 2 })` → 0–3 and 5–10 */
export function wallOutsideBox(value: Wall, box: EraseBox): Wall[] | null {
  const segments = wallSegments(value);
  const spans = segments.map((segment) => insideSpan(segment, box));
  if (spans.every((span) => span === null)) return null;
  const vertices = [segments[0]?.from, ...segments.map(({ to }) => to)].filter(isPoint);
  const paths = keptPaths(segments, spans);
  const joined = isClosed(vertices) ? joinedRing(paths, spans) : paths;
  return joined.filter(hasLength).map((path) => wallAlong(value.kind, path));
}

// The part of a piece inside the box, as [enter, leave] along it (Liang–Barsky); none or a point → null.
type Span = Readonly<{ enter: number; leave: number }>;

const SPAN_EPSILON = 1e-9;

function insideSpan({ from, to }: Segment, box: EraseBox): Span | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const edges: ReadonlyArray<readonly [number, number]> = [
    [-dx, from.x - box.x],
    [dx, box.x + box.width - from.x],
    [-dy, from.y - box.y],
    [dy, box.y + box.height - from.y],
  ];
  let enter = 0;
  let leave = 1;
  for (const [toward, room] of edges) {
    if (toward === 0 && room < -SPAN_EPSILON) return null;
    if (toward < 0) enter = Math.max(enter, room / toward);
    if (toward > 0) leave = Math.min(leave, room / toward);
  }
  return leave - enter > SPAN_EPSILON ? { enter, leave } : null;
}

function keptPaths(segments: readonly Segment[], spans: readonly (Span | null)[]): Vector2[][] {
  const paths: Vector2[][] = [];
  let current: Vector2[] = [];
  segments.forEach((segment, index) => {
    const span = spans[index];
    if (!span) return void (current = extended(current, segment.from, segment.to));
    if (span.enter > SPAN_EPSILON)
      current = extended(current, segment.from, along(segment, span.enter));
    if (current.length > 0) paths.push(current);
    current = span.leave < 1 - SPAN_EPSILON ? [along(segment, span.leave), segment.to] : [];
  });
  if (current.length > 0) paths.push(current);
  return paths;
}

// A closed outline cut somewhere else than at its first vertex: its last path runs on into its first.
function joinedRing(paths: Vector2[][], spans: readonly (Span | null)[]): Vector2[][] {
  const first = spans[0];
  const last = spans.at(-1);
  const startKept = !first || first.enter > SPAN_EPSILON;
  const endKept = !last || last.leave < 1 - SPAN_EPSILON;
  const [head, ...others] = paths;
  const tail = others.at(-1);
  if (!head || !tail || !startKept || !endKept) return paths;
  return [[...tail, ...head.slice(1)], ...others.slice(0, -1)];
}

function extended(path: Vector2[], from: Vector2, to: Vector2): Vector2[] {
  return path.length === 0 ? [from, to] : [...path, to];
}

function along({ from, to }: Segment, t: number): Vector2 {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

// A sliver shorter than the hundredth the table keeps is no wall.
function hasLength(path: readonly Vector2[]): boolean {
  const [start] = path;
  return (
    !!start &&
    path.some(
      ({ x, y }) => hundredth(x) !== hundredth(start.x) || hundredth(y) !== hundredth(start.y),
    )
  );
}

// v0 … vn with vn = v0: taking piece i out leaves v(i+1) … vn, v1 … vi.
function openedAt(vertices: readonly Vector2[], segmentIndex: number): Vector2[] {
  const ring = vertices.slice(0, -1);
  const start = segmentIndex + 1;
  return [...ring.slice(start), ...ring.slice(0, start)];
}

function wallAlong(kind: Wall['kind'], path: readonly Vector2[]): Wall {
  const rounded = path.map(({ x, y }) => ({ x: hundredth(x), y: hundredth(y) }));
  const x = Math.min(...rounded.map((point) => point.x));
  const y = Math.min(...rounded.map((point) => point.y));
  const width = hundredth(Math.max(...rounded.map((point) => point.x)) - x);
  const height = hundredth(Math.max(...rounded.map((point) => point.y)) - y);
  const points = rounded.map((point): WallPoint => [
    hundredth(point.x - x),
    hundredth(point.y - y),
  ]);
  // A door is always one straight piece, so what is left of anything is a plain kind of path.
  const pathKind = kind === 'door' ? 'wall' : kind;
  const shape = points.length === 2 ? 'line' : 'freehand';
  return wall({ kind: pathKind, shape, x, y, width, height, points, doorState: null });
}

function isClosed(vertices: readonly Vector2[]): boolean {
  const first = vertices[0];
  const last = vertices.at(-1);
  return vertices.length > 2 && !!first && !!last && first.x === last.x && first.y === last.y;
}

function isPoint(point: Vector2 | undefined): point is Vector2 {
  return point !== undefined;
}

function hundredth(value: number): number {
  return Math.round(value * 100) / 100;
}
