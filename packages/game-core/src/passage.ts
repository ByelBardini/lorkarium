import type { Cell } from './cell.vo';
import type { Vector2 } from './facing';
import type { TokenSize } from './token-size.vo';
import { wallSegments, type Segment } from './wall-segments';
import { blocksMovement, type Wall } from './wall.vo';

/** Which leg of a path a wall bars first, and which wall (indexes into the lists given). */
export type BlockedPassage = Readonly<{ legIndex: number; wallIndex: number }>;

// Walls and cells are stored to 0.01; 1e-9 only absorbs floating error, never a real gap.
const TOUCH_TOLERANCE = 1e-9;

/** The first leg of a path (token centers: origin, bends, destination) that meets a wall barring
 *  movement, or `null` when the path is clear. Touching a wall counts as crossing, except at the
 *  start of a leg, so a token standing on a line can step off it.
 *
 *  Example: `blockedPassage([{ x: 1.5, y: 5.5 }, { x: 4.5, y: 5.5 }], [wallAtX2])` → `{ legIndex: 0, wallIndex: 0 }` */
export function blockedPassage(
  path: readonly Vector2[],
  walls: readonly Wall[],
): BlockedPassage | null {
  const barriers = walls.map((value) => (blocksMovement(value) ? wallSegments(value) : []));
  for (let legIndex = 1; legIndex < path.length; legIndex += 1) {
    const from = path[legIndex - 1];
    const to = path[legIndex];
    if (!from || !to) continue;
    const wallIndex = barriers.findIndex((segments) =>
      segments.some((segment) => legTouchesSegment({ from, to }, segment)),
    );
    if (wallIndex >= 0) return { legIndex: legIndex - 1, wallIndex };
  }
  return null;
}

/** Whether a leg meets a segment anywhere past the leg's start: crossing, touching an end or
 *  running collinear over it. Passage and line of sight share it.
 *
 *  Example: `legTouchesSegment({ from: { x: 0, y: 5 }, to: { x: 4, y: 5 } }, wallAtX2)` → `true` */
export function legTouchesSegment(leg: Segment, segment: Segment): boolean {
  const r = minus(leg.to, leg.from);
  const s = minus(segment.to, segment.from);
  const legLength = Math.hypot(r.x, r.y);
  if (legLength <= TOUCH_TOLERANCE) return false;
  const offset = minus(segment.from, leg.from);
  const denominator = cross(r, s);
  if (Math.abs(denominator) > TOUCH_TOLERANCE) {
    return crossesPastStart(offset, r, s, denominator, legLength);
  }
  if (Math.abs(cross(offset, r)) / legLength > TOUCH_TOLERANCE) return false;
  return overlapsPastStart(offset, minus(segment.to, leg.from), r, legLength);
}

/** The center of a token's footprint, the point its passage is checked from.
 *
 *  Example: `tokenCenter({ col: 3, row: 4 }, { width: 2, height: 1 })` → `{ x: 4, y: 4.5 }` */
export function tokenCenter(position: Pick<Cell, 'col' | 'row'>, size: TokenSize): Vector2 {
  return { x: position.col + size.width / 2, y: position.row + size.height / 2 };
}

function crossesPastStart(
  offset: Vector2,
  r: Vector2,
  s: Vector2,
  denominator: number,
  legLength: number,
): boolean {
  const t = cross(offset, s) / denominator;
  const u = cross(offset, r) / denominator;
  const slack = TOUCH_TOLERANCE / legLength;
  const segmentSlack = TOUCH_TOLERANCE / Math.max(Math.hypot(s.x, s.y), TOUCH_TOLERANCE);
  const onSegment = u >= -segmentSlack && u <= 1 + segmentSlack;
  return onSegment && t > slack && t <= 1 + slack;
}

function overlapsPastStart(start: Vector2, end: Vector2, r: Vector2, legLength: number): boolean {
  const lengthSquared = legLength * legLength;
  const t0 = dot(start, r) / lengthSquared;
  const t1 = dot(end, r) / lengthSquared;
  const slack = TOUCH_TOLERANCE / legLength;
  const farthest = Math.min(1, Math.max(t0, t1));
  const nearest = Math.max(0, Math.min(t0, t1));
  return farthest > slack && nearest <= farthest + slack;
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
