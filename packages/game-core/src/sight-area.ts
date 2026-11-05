import type { Vector2 } from './facing';
import type { SceneSize } from './grid';
import { legTouchesSegment } from './passage';
import { fieldOutlineAngles, fieldReachAt, type ViewField } from './view-field';
import { preparedWalls, type PreparedWalls, type SegmentIndex } from './wall-index';
import type { Segment } from './wall-segments';
import type { Wall } from './wall.vo';

/** How many rays sample the edge of the reach circle (one every 5.625°). */
export const SIGHT_ARC_SAMPLES = 64;

// A ray just past each vertex shows what lies behind its corner (Red Blob Games' sweep).
const CORNER_NUDGE = 1e-5;
const HIT_TOLERANCE = 1e-9;
const FULL_TURN = 2 * Math.PI;

/** The walls a line of sight leaves out, by reference to the same objects as in its `walls`: the
 *  door being looked at, or a list (the walls of a blocker). A filtered array would pay for another
 *  preparation; this shares the one of the whole list. */
export type WallsLeftOut = Wall | readonly Wall[];

/** The polygon an eye sees: rays from the eye stop at the nearest wall that blocks sight or at
 *  the scene border, then at `reach` (cells; `Infinity` = up to the border). Vertices come in
 *  angle order, so the same input always gives the same polygon. Rays go to every wall vertex
 *  (and just past it), to wall crossings, to where walls leave the reach circle and to 64 arc
 *  samples (ncase's "Sight & Light"). A `field` also stops each ray at its edge for that angle
 *  (the cone, then the ring or the apex), so a cone stays one star-shaped polygon. `ignores` (the
 *  same objects as in `walls`) gives the polygon of the scene without them, over the same
 *  preparation.
 *
 *  Example: `sightArea({ x: 10.5, y: 6.5 }, walls, { widthCells: 20, heightCells: 12 }, 3, undefined, statue.walls)` */
export function sightArea(
  eye: Vector2,
  walls: readonly Wall[],
  scene: SceneSize,
  reach: number,
  field?: ViewField,
  ignores?: readonly Wall[],
): Vector2[] {
  const prepared = preparedWalls(walls);
  const skipped = skippedSegments(prepared.sight, walls, ignores);
  const near = sightBlockersNear(eye, prepared.sight, reach, skipped);
  const border = sceneBorder(scene);
  const extra = field ? fieldOutlineAngles(field, eye) : [];
  const vertices = rayAngles(eye, near, prepared, border, reach, extra).map((angle) => {
    const limit = field ? Math.min(reach, fieldReachAt(field, eye, angle)) : reach;
    return clampToScene(castRay(eye, angle, prepared.sight, border, limit, skipped), scene);
  });
  return field ? withoutRepeats(vertices) : vertices;
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
 *  both sides; a target on a wall line is behind it. `except` (one of `walls`, or a list of them) is
 *  left out: a door never hides itself, nor a blocker. Only the segments in the buckets the leg
 *  crosses are tried.
 *
 *  Example: `lineOfSight({ x: 1, y: 5 }, { x: 4, y: 5 }, [grateAtX2])` → `true` */
export function lineOfSight(
  from: Vector2,
  to: Vector2,
  walls: readonly Wall[],
  except?: WallsLeftOut,
): boolean {
  const { sight } = preparedWalls(walls);
  const leg = { from, to };
  const touches = (i: number): boolean => {
    const segment = sight.segments[i];
    if (segment === undefined || !legTouchesSegment(leg, segment)) return false;
    return except === undefined || !isLeftOut(except, walls[sight.wallIndexes[i] ?? -1]);
  };
  return !sight.someAlong(from, to, touches);
}

/** What a line leaves out once a light or an eye adds its own `ignores` to `except`. Nothing to add
 *  gives `except` back, so the path with no blocker allocates nothing.
 *
 *  Example: `leftOutWith(door, eye.ignores)` → `[door, ...eye.ignores]` */
export function leftOutWith(
  except: WallsLeftOut | undefined,
  ignores: readonly Wall[] | undefined,
): WallsLeftOut | undefined {
  if (!ignores || ignores.length === 0) return except;
  if (except === undefined) return ignores;
  return isWallList(except) ? [...except, ...ignores] : [except, ...ignores];
}

function isWallList(value: WallsLeftOut): value is readonly Wall[] {
  return Array.isArray(value);
}

function isLeftOut(except: WallsLeftOut, owner: Wall | undefined): boolean {
  if (owner === undefined) return false;
  return isWallList(except) ? except.includes(owner) : except === owner;
}

// Which segments the eye leaves out; `null` with no list, the path that allocates nothing more.
function skippedSegments(
  sight: SegmentIndex,
  walls: readonly Wall[],
  ignores: readonly Wall[] | undefined,
): readonly boolean[] | null {
  if (!ignores || ignores.length === 0) return null;
  return sight.wallIndexes.map((wallIndex) => isLeftOut(ignores, walls[wallIndex]));
}

function crossesRayRight(point: Vector2, a: Vector2, b: Vector2): boolean {
  if (a.y > point.y === b.y > point.y) return false;
  const crossingX = a.x + ((point.y - a.y) * (b.x - a.x)) / (b.y - a.y);
  return point.x < crossingX;
}

/** The sight-blocking segments in the reach box of an eye, in wall order, and which of them. */
type NearBlockers = Readonly<{ segments: readonly Segment[]; near: readonly boolean[] }>;

function sightBlockersNear(
  eye: Vector2,
  sight: SegmentIndex,
  reach: number,
  skipped: readonly boolean[] | null,
): NearBlockers {
  const near = sight.segments.map(
    (segment, index) => !skipped?.[index] && withinReachBox(eye, segment, reach),
  );
  return { segments: sight.segments.filter((_, index) => near[index]), near };
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
  blockers: NearBlockers,
  prepared: PreparedWalls,
  border: readonly Segment[],
  reach: number,
  fieldAngles: readonly number[],
): number[] {
  const outline = [...blockers.segments, ...border];
  const crossings = crossingAngles(eye, blockers, prepared);
  const corners = [...vertexAngles(eye, outline), ...crossings, ...fieldAngles];
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

// The crossings are worked out once per walls array; an eye keeps those of two near blockers.
function crossingAngles(eye: Vector2, blockers: NearBlockers, prepared: PreparedWalls): number[] {
  return prepared
    .crossings()
    .filter(({ first, second }) => blockers.near[first] && blockers.near[second])
    .map(({ point }) => angleTo(eye, point));
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

// Only the buckets along the ray, nearest first, until no farther one can hold a nearer wall; a
// wall out of the reach box cannot be hit before the reach, so the result is the same.
function castRay(
  eye: Vector2,
  angle: number,
  sight: SegmentIndex,
  border: readonly Segment[],
  reach: number,
  skipped: readonly boolean[] | null,
): Vector2 {
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const hitOf = (i: number): number => {
    const segment = sight.segments[i];
    if (!segment || skipped?.[i]) return Number.POSITIVE_INFINITY;
    return rayHit(eye, direction, segment);
  };
  let nearest = sight.nearestAlong(eye, direction, reach, hitOf);
  for (const segment of border) nearest = Math.min(nearest, rayHit(eye, direction, segment));
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

// Many rays of a lantern land on its apex; one vertex there is enough.
function withoutRepeats(vertices: readonly Vector2[]): Vector2[] {
  const kept = vertices.filter((vertex, index) => !samePoint(vertex, vertices[index - 1]));
  if (kept.length > 1 && samePoint(kept[0], kept.at(-1))) kept.pop();
  return kept;
}

function samePoint(a: Vector2 | undefined, b: Vector2 | undefined): boolean {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) <= HIT_TOLERANCE && Math.abs(a.y - b.y) <= HIT_TOLERANCE;
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
