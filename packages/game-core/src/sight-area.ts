import type { Vector2 } from './facing';
import type { SceneSize } from './grid';
import { legTouchesSegment } from './passage';
import { wallSegments, type Segment } from './wall-segments';
import { blocksSight, type Wall } from './wall.vo';

/** How many rays sample the edge of the reach circle (one every 5.625°). */
export const SIGHT_ARC_SAMPLES = 64;

// A ray just past each vertex shows what lies behind its corner (Red Blob Games' sweep).
const CORNER_NUDGE = 1e-5;
const HIT_TOLERANCE = 1e-9;
const FULL_TURN = 2 * Math.PI;

/** The polygon an eye sees: rays from the eye stop at the nearest wall that blocks sight or at
 *  the scene border, then at `reach` (cells; `Infinity` = up to the border). Vertices come in
 *  angle order, so the same input always gives the same polygon. Rays go to every wall vertex
 *  (and just past it), to wall crossings, to where walls leave the reach circle and to 64 arc
 *  samples (ncase's "Sight & Light").
 *
 *  Example: `sightArea({ x: 10.5, y: 6.5 }, walls, { widthCells: 20, heightCells: 12 }, 3)` */
export function sightArea(
  eye: Vector2,
  walls: readonly Wall[],
  scene: SceneSize,
  reach: number,
): Vector2[] {
  const blockers = sightBlockersNear(eye, walls, reach);
  const border = sceneBorder(scene);
  const segments = [...blockers, ...border];
  return rayAngles(eye, blockers, border, reach).map((angle) =>
    clampToScene(castRay(eye, angle, segments, reach), scene),
  );
}

/** Whether a point lies inside a polygon (even-odd rule).
 *
 *  Example: `insidePolygon({ x: 1, y: 1 }, [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }])` → `true` */
export function insidePolygon(point: Vector2, polygon: readonly Vector2[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    if (a && b && crossesRayRight(point, a, b)) inside = !inside;
  }
  return inside;
}

/** Whether nothing that blocks sight lies between two points. An eye standing on a wall line sees
 *  both sides; a target on a wall line is behind it.
 *
 *  Example: `lineOfSight({ x: 1, y: 5 }, { x: 4, y: 5 }, [grateAtX2])` → `true` */
export function lineOfSight(from: Vector2, to: Vector2, walls: readonly Wall[]): boolean {
  const leg = { from, to };
  return !walls.some(
    (value) =>
      blocksSight(value) && wallSegments(value).some((segment) => legTouchesSegment(leg, segment)),
  );
}

function crossesRayRight(point: Vector2, a: Vector2, b: Vector2): boolean {
  if (a.y > point.y === b.y > point.y) return false;
  const crossingX = a.x + ((point.y - a.y) * (b.x - a.x)) / (b.y - a.y);
  return point.x < crossingX;
}

function sightBlockersNear(eye: Vector2, walls: readonly Wall[], reach: number): Segment[] {
  return walls
    .filter(blocksSight)
    .flatMap(wallSegments)
    .filter((segment) => withinReachBox(eye, segment, reach));
}

function withinReachBox(eye: Vector2, { from, to }: Segment, reach: number): boolean {
  if (!Number.isFinite(reach)) return true;
  return (
    Math.max(from.x, to.x) >= eye.x - reach &&
    Math.min(from.x, to.x) <= eye.x + reach &&
    Math.max(from.y, to.y) >= eye.y - reach &&
    Math.min(from.y, to.y) <= eye.y + reach
  );
}

function sceneBorder({ widthCells: w, heightCells: h }: SceneSize): Segment[] {
  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  return corners.map((from, index) => ({ from, to: corners[(index + 1) % 4] ?? from }));
}

function rayAngles(
  eye: Vector2,
  blockers: readonly Segment[],
  border: readonly Segment[],
  reach: number,
): number[] {
  const outline = [...blockers, ...border];
  const corners = [...vertexAngles(eye, outline), ...crossingAngles(eye, blockers)];
  if (Number.isFinite(reach)) corners.push(...reachExitAngles(eye, outline, reach));
  const nudged = corners.flatMap((angle) => [angle - CORNER_NUDGE, angle, angle + CORNER_NUDGE]);
  const arc = Array.from(
    { length: SIGHT_ARC_SAMPLES },
    (_, k) => (FULL_TURN * k) / SIGHT_ARC_SAMPLES,
  );
  return uniqueSorted([...nudged, ...arc].map(normalizeAngle));
}

function vertexAngles(eye: Vector2, blockers: readonly Segment[]): number[] {
  return blockers.flatMap(({ from, to }) => [angleTo(eye, from), angleTo(eye, to)]);
}

function crossingAngles(eye: Vector2, blockers: readonly Segment[]): number[] {
  const angles: number[] = [];
  for (let i = 0; i < blockers.length; i += 1) {
    for (let j = i + 1; j < blockers.length; j += 1) {
      const point = crossingPoint(blockers[i], blockers[j]);
      if (point) angles.push(angleTo(eye, point));
    }
  }
  return angles;
}

function crossingPoint(a: Segment | undefined, b: Segment | undefined): Vector2 | null {
  if (!a || !b) return null;
  const r = minus(a.to, a.from);
  const s = minus(b.to, b.from);
  const denominator = cross(r, s);
  if (Math.abs(denominator) <= HIT_TOLERANCE) return null;
  const offset = minus(b.from, a.from);
  const t = cross(offset, s) / denominator;
  const u = cross(offset, r) / denominator;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { x: a.from.x + t * r.x, y: a.from.y + t * r.y };
}

function reachExitAngles(eye: Vector2, blockers: readonly Segment[], reach: number): number[] {
  return blockers.flatMap((segment) =>
    circleCrossings(eye, segment, reach).map((point) => angleTo(eye, point)),
  );
}

function circleCrossings(eye: Vector2, { from, to }: Segment, reach: number): Vector2[] {
  const d = minus(to, from);
  const f = minus(from, eye);
  const a = dot(d, d);
  const b = 2 * dot(f, d);
  const discriminant = b * b - 4 * a * (dot(f, f) - reach * reach);
  if (a <= HIT_TOLERANCE || discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    .filter((t) => t >= 0 && t <= 1)
    .map((t) => ({ x: from.x + t * d.x, y: from.y + t * d.y }));
}

function castRay(
  eye: Vector2,
  angle: number,
  segments: readonly Segment[],
  reach: number,
): Vector2 {
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  let nearest = reach;
  for (const segment of segments) nearest = Math.min(nearest, rayHit(eye, direction, segment));
  if (!Number.isFinite(nearest)) return eye;
  return { x: eye.x + direction.x * nearest, y: eye.y + direction.y * nearest };
}

function rayHit(eye: Vector2, direction: Vector2, segment: Segment): number {
  const s = minus(segment.to, segment.from);
  const denominator = cross(direction, s);
  if (Math.abs(denominator) <= HIT_TOLERANCE) return Number.POSITIVE_INFINITY;
  const offset = minus(segment.from, eye);
  const t = cross(offset, s) / denominator;
  const u = cross(offset, direction) / denominator;
  const onSegment = u >= -HIT_TOLERANCE && u <= 1 + HIT_TOLERANCE;
  return onSegment && t > HIT_TOLERANCE ? t : Number.POSITIVE_INFINITY;
}

function clampToScene(point: Vector2, { widthCells, heightCells }: SceneSize): Vector2 {
  return {
    x: Math.min(Math.max(point.x, 0), widthCells),
    y: Math.min(Math.max(point.y, 0), heightCells),
  };
}

function uniqueSorted(angles: number[]): number[] {
  const sorted = [...angles].sort((a, b) => a - b);
  return sorted.filter((angle, index) => index === 0 || angle - (sorted[index - 1] ?? 0) > 1e-12);
}

function normalizeAngle(angle: number): number {
  return ((angle % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

function angleTo(eye: Vector2, point: Vector2): number {
  return Math.atan2(point.y - eye.y, point.x - eye.x);
}

function minus(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function cross(a: Vector2, b: Vector2): number {
  return a.x * b.y - a.y * b.x;
}

function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}
