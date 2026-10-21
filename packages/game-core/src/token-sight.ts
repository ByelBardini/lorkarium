import { coneOf } from './cone.vo';
import type { Vector2 } from './facing';
import { lightLevelAt, type LightSource } from './lighting';
import { REACH_MAX, assertReach } from './reach';
import { lineOfSight } from './sight-area';
import { withinField, type FieldBox, type ViewField } from './view-field';
import { wallSegments } from './wall-segments';
import type { Wall } from './wall.vo';

/** How a scene hides what tokens cannot see: `off` shows everything, `dark` limits each eye to its
 *  range and to what is lit, `daylight` gives every eye an unlimited bright range (walls still cut). */
export type SightMode = 'off' | 'dark' | 'daylight';

/** The longest bright or dim range, in cells (the widest scene). */
export const SIGHT_RANGE_MAX = REACH_MAX;

/** How far a token sees, in cells: fully up to `bright`, then `dim` more where it sees the map
 *  but only silhouettes of tokens. */
export type SightRange = Readonly<{ bright: number; dim: number }>;

/** A point that sees: the center of a token the viewer controls. `range` is its darkvision;
 *  `null` sees only what is lit (or everything by daylight). `field` limits everything it sees to
 *  its cone and ring; `null` sees every side. */
export type Eye = Readonly<{ center: Vector2; range: SightRange | null; field: ViewField | null }>;

/** Everything a level of sight depends on besides the target. */
export type SightContext = Readonly<{
  eyes: readonly Eye[];
  walls: readonly Wall[];
  mode: SightMode;
  lights: readonly LightSource[];
}>;

/** A token as sight sees it: its footprint in cells and whether it is scenery (Background layer). */
export type SightTarget = Readonly<{
  box: Readonly<{ x: number; y: number; width: number; height: number }>;
  scenery: boolean;
}>;

/** `seen` shows the token, `silhouette` a black shape with nothing else, `hidden` nothing. */
export type SightLevel = 'seen' | 'silhouette' | 'hidden';

const LEVEL_RANK: Readonly<Record<SightLevel, number>> = { hidden: 0, silhouette: 1, seen: 2 };
// The corners are pulled 10% inward so a token touching a wall is not seen through it.
const CORNER_INSET = 0.1;
const DOOR_PROBES = [0.1, 0.5, 0.9];

/** Builds a sight range, refusing a side that is not a finite number from 0 to 100 cells.
 *
 *  Example: `sightRange(12, 4)` → `{ bright: 12, dim: 4 }` */
export function sightRange(bright: number, dim: number): SightRange {
  assertReach('Sight', 'bright', bright);
  assertReach('Sight', 'dim', dim);
  return Object.freeze({ bright, dim });
}

/** The eye of a token centered at `center`. Every token is an eye: without a range it sees only
 *  what is lit in the dark, and everything in line of sight by daylight. Without a `field` it sees
 *  every side.
 *
 *  Example: `eyeOf({ x: 5.5, y: 5.5 }, null)` → `{ center: { x: 5.5, y: 5.5 }, range: null, field: null }` */
export function eyeOf(
  center: Vector2,
  range: SightRange | null,
  field: ViewField | null = null,
): Eye {
  return { center, range, field };
}

/** The field of a token's eye: the cone it faces plus the ring around its footprint, or `null`
 *  at 360° (every side).
 *
 *  Example: `eyeFieldOf({ x: 5, y: 5, width: 1, height: 1 }, 0, 90)` → `{ cone: { facing: 0, angle: 90 }, around: footprint }` */
export function eyeFieldOf(
  footprint: FieldBox,
  direction: number,
  angle: number,
): ViewField | null {
  const cone = coneOf(direction, angle);
  return cone ? { cone, around: footprint } : null;
}

/** How well the eyes see a token: at each probe (center and inset corners) the level is the
 *  better of the eye's own range and the light there, and counts only in the eye's line of sight
 *  and field (cone + ring; a probe outside it is hidden whatever lights it).
 *  `seen` in bright, `silhouette` in dim (scenery is `seen` there), else `hidden`. Daylight has no
 *  range limit; `off` sees everything.
 *
 *  Example: `sightLevel({ eyes: [blindEye], walls: [], mode: 'dark', lights: [torch] }, { box: ogreBox, scenery: false })` → `'seen'` */
export function sightLevel(context: SightContext, target: SightTarget): SightLevel {
  if (context.mode === 'off') return 'seen';
  let best: SightLevel = 'hidden';
  for (const point of probesOf(target.box)) {
    const lit = litLevel(point, context, context.walls);
    for (const eye of context.eyes) {
      const level = levelAt(eye, point, context, { scenery: target.scenery, lit });
      if (LEVEL_RANK[level] > LEVEL_RANK[best]) best = level;
      if (best === 'seen') return best;
    }
  }
  return best;
}

/** Whether any eye sees a door (bright or dim, by its own range or by light) through the other
 *  walls: the door hides neither itself nor itself from the light. `door` must be the same object
 *  as in `context.walls`, or not be there.
 *
 *  Example: `doorSeenBy({ eyes: [blindEye], walls, mode: 'dark', lights: [torch] }, cellarDoor)` → `true` */
export function doorSeenBy(context: SightContext, door: Wall): boolean {
  if (context.mode === 'off') return true;
  const others = { ...context, walls: context.walls.filter((value) => value !== door) };
  return doorProbes(door).some((point) => {
    const lit = litLevel(point, context, others.walls);
    return context.eyes.some(
      (eye) => levelAt(eye, point, others, { scenery: true, lit }) === 'seen',
    );
  });
}

type ProbeLight = Readonly<{ scenery: boolean; lit: SightLevel }>;

function levelAt(eye: Eye, point: Vector2, context: SightContext, probe: ProbeLight): SightLevel {
  if (eye.field && !withinField(eye.field, eye.center, point)) return 'hidden';
  const distance = Math.hypot(point.x - eye.center.x, point.y - eye.center.y);
  const own = context.mode === 'daylight' ? 'seen' : rangeLevel(eye.range, distance);
  const level = LEVEL_RANK[probe.lit] > LEVEL_RANK[own] ? probe.lit : own;
  if (level === 'hidden' || !lineOfSight(eye.center, point, context.walls)) return 'hidden';
  return probe.scenery ? 'seen' : level;
}

// Daylight already lights everything, so lights only matter in the dark.
function litLevel(point: Vector2, context: SightContext, walls: readonly Wall[]): SightLevel {
  if (context.mode !== 'dark') return 'hidden';
  return lightLevelAt(point, context.lights, walls);
}

function rangeLevel(range: SightRange | null, distance: number): SightLevel {
  if (!range) return 'hidden';
  if (distance <= range.bright) return 'seen';
  return distance <= range.bright + range.dim ? 'silhouette' : 'hidden';
}

function probesOf({ x, y, width, height }: SightTarget['box']): Vector2[] {
  const near = { x: x + width * CORNER_INSET, y: y + height * CORNER_INSET };
  const far = { x: x + width * (1 - CORNER_INSET), y: y + height * (1 - CORNER_INSET) };
  return [
    { x: x + width / 2, y: y + height / 2 },
    near,
    { x: far.x, y: near.y },
    far,
    { x: near.x, y: far.y },
  ];
}

function doorProbes(door: Wall): Vector2[] {
  const segment = wallSegments(door)[0];
  if (!segment) return [];
  const { from, to } = segment;
  return DOOR_PROBES.map((t) => ({
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  }));
}
