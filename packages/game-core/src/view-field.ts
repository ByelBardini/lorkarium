import type { Cone } from './cone.vo';
import type { Vector2 } from './facing';

/** A footprint in fractional cells (the token the ring is measured from). */
export type FieldBox = Readonly<{ x: number; y: number; width: number; height: number }>;

/** Where an eye or a lantern reaches by angle: the `cone` it faces, plus, for an eye, the ring of
 *  `AWARENESS_RANGE` cells `around` its footprint it still feels outside the cone (`null` for a lantern). */
export type ViewField = Readonly<{ cone: Cone; around: FieldBox | null }>;

/** How far, in cells from the footprint's edge, an eye feels what lies outside its cone. */
export const AWARENESS_RANGE = 1;

// Points are stored to 0.01 cell; the slack keeps a point exactly on an edge inside.
const EDGE_SLACK = 1e-9;
const DEGREES_PER_RADIAN = 180 / Math.PI;

/** Whether a point lies in the cone opening from `apex`; the edge and the apex count, and no cone
 *  (`null`, every side) holds every point.
 *
 *  Example: `insideCone(coneOf(0, 90), { x: 5.5, y: 5.5 }, { x: 8.5, y: 8.5 })` → `true` (45°, the edge) */
export function insideCone(cone: Cone | null, apex: Vector2, point: Vector2): boolean {
  if (!cone) return true;
  const dx = point.x - apex.x;
  const dy = point.y - apex.y;
  if (dx === 0 && dy === 0) return true;
  return (
    angleOff(cone.facing, Math.atan2(dy, dx) * DEGREES_PER_RADIAN) <= cone.angle / 2 + EDGE_SLACK
  );
}

/** How far a point is from the nearest edge of a box (0 inside it), Euclidean.
 *
 *  Example: `distanceToBox({ x: 5, y: 5, width: 1, height: 1 }, { x: 8, y: 5.5 })` → `2` */
export function distanceToBox(box: FieldBox, point: Vector2): number {
  const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width));
  const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height));
  return Math.hypot(dx, dy);
}

/** Whether a point lies in the field: in the cone, or within `AWARENESS_RANGE` of the footprint
 *  (the edge counts).
 *
 *  Example: `withinField({ cone: coneOf(0, 90), around: lyraBox }, lyraCenter, { x: 4.5, y: 5.5 })` → `true` (the ring) */
export function withinField(field: ViewField, apex: Vector2, point: Vector2): boolean {
  if (insideCone(field.cone, apex, point)) return true;
  if (!field.around) return false;
  return distanceToBox(field.around, point) <= AWARENESS_RANGE + EDGE_SLACK;
}

/** How far a ray from `apex` at `radians` may go inside the field: unlimited in the cone, up to
 *  the ring's edge outside it, and 0 for a lantern (it shines nothing there). The caller still
 *  stops the ray at walls, the scene and its own reach.
 *
 *  Example: `fieldReachAt({ cone: coneOf(0, 90), around: lyraBox }, lyraCenter, Math.PI)` → `1.5` */
export function fieldReachAt(field: ViewField, apex: Vector2, radians: number): number {
  const direction = { x: Math.cos(radians), y: Math.sin(radians) };
  const ahead = { x: apex.x + direction.x, y: apex.y + direction.y };
  if (insideCone(field.cone, apex, ahead)) return Number.POSITIVE_INFINITY;
  if (!field.around) return 0;
  return ringExit(field.around, apex, direction);
}

/** The directions (radians from `apex`) a ray must take for the field's outline to stay exact:
 *  the two cone edges and the 8 points where the ring's straight sides meet its rounded corners.
 *
 *  Example: `fieldOutlineAngles({ cone: coneOf(0, 90), around: null }, apex)` → `[-π/4, π/4]` */
export function fieldOutlineAngles(field: ViewField, apex: Vector2): number[] {
  const edges = [-1, 1].map(
    (side) => (field.cone.facing + (side * field.cone.angle) / 2) / DEGREES_PER_RADIAN,
  );
  if (!field.around) return edges;
  const joints = ringJoints(field.around).map((p) => Math.atan2(p.y - apex.y, p.x - apex.x));
  return [...edges, ...joints];
}

function ringJoints(box: FieldBox): Vector2[] {
  const r = AWARENESS_RANGE;
  return cornersOf(box).flatMap((corner) => {
    const sx = corner.x === box.x ? -1 : 1;
    const sy = corner.y === box.y ? -1 : 1;
    return [
      { x: corner.x + sx * r, y: corner.y },
      { x: corner.x, y: corner.y + sy * r },
    ];
  });
}

// The ring is the footprint grown by AWARENESS_RANGE with rounded corners: the union of two grown
// rectangles and four corner circles. It is convex and holds the apex, so the ray leaves it at the
// farthest exit of any piece.
function ringExit(box: FieldBox, apex: Vector2, direction: Vector2): number {
  const r = AWARENESS_RANGE;
  const wide = { x: box.x - r, y: box.y, width: box.width + 2 * r, height: box.height };
  const tall = { x: box.x, y: box.y - r, width: box.width, height: box.height + 2 * r };
  const circleExits = cornersOf(box).map((corner) => circleExit(corner, apex, direction));
  return Math.max(boxExit(wide, apex, direction), boxExit(tall, apex, direction), ...circleExits);
}

function cornersOf({ x, y, width, height }: FieldBox): Vector2[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

function boxExit(box: FieldBox, apex: Vector2, direction: Vector2): number {
  return Math.min(
    axisExit(box.x, box.width, apex.x, direction.x),
    axisExit(box.y, box.height, apex.y, direction.y),
  );
}

function axisExit(start: number, length: number, from: number, step: number): number {
  if (step === 0) return Number.POSITIVE_INFINITY;
  return ((step > 0 ? start + length : start) - from) / step;
}

function circleExit(center: Vector2, apex: Vector2, direction: Vector2): number {
  const fx = apex.x - center.x;
  const fy = apex.y - center.y;
  const b = fx * direction.x + fy * direction.y;
  const discriminant = b * b - (fx * fx + fy * fy - AWARENESS_RANGE * AWARENESS_RANGE);
  if (discriminant < 0) return Number.NEGATIVE_INFINITY;
  return -b + Math.sqrt(discriminant);
}

// The unsigned gap between two directions in degrees, from 0 to 180.
function angleOff(facingDegrees: number, degrees: number): number {
  const gap = (((degrees - facingDegrees) % 360) + 360) % 360;
  return gap > 180 ? 360 - gap : gap;
}
