import type { Vector2 } from './facing';
import { lineOfSight } from './sight-area';
import { wallSegments } from './wall-segments';
import type { Wall } from './wall.vo';

/** How a scene hides what tokens cannot see: `off` shows everything, `dark` limits each eye to its
 *  range, `daylight` gives every eye an unlimited bright range (walls still cut). */
export type SightMode = 'off' | 'dark' | 'daylight';

/** The longest bright or dim range, in cells (the widest scene). */
export const SIGHT_RANGE_MAX = 100;

/** How far a token sees, in cells: fully up to `bright`, then `dim` more where it sees the map
 *  but only silhouettes of tokens. */
export type SightRange = Readonly<{ bright: number; dim: number }>;

/** A point that sees: the center of a token the viewer controls. `range: null` sees only by daylight. */
export type Eye = Readonly<{ center: Vector2; range: SightRange | null }>;

/** Everything a level of sight depends on besides the target. */
export type SightContext = Readonly<{
  eyes: readonly Eye[];
  walls: readonly Wall[];
  mode: SightMode;
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
  assertRange('bright', bright);
  assertRange('dim', dim);
  return Object.freeze({ bright, dim });
}

/** The eye of a token centered at `center`, or `null` when it does not see in this mode (no
 *  range in the dark). By daylight every token sees, with or without a range.
 *
 *  Example: `eyeOf({ x: 5.5, y: 5.5 }, null, 'daylight')` → `{ center: { x: 5.5, y: 5.5 }, range: null }` */
export function eyeOf(center: Vector2, range: SightRange | null, mode: SightMode): Eye | null {
  if (mode === 'dark' && range === null) return null;
  return { center, range };
}

/** How well the eyes see a token: its center or an inset corner within bright range and in line
 *  of sight is `seen`, within bright + dim a `silhouette` (scenery is `seen` there), else `hidden`.
 *  Daylight has no range limit; `off` sees everything.
 *
 *  Example: `sightLevel({ eyes: [torch], walls: [], mode: 'dark' }, { box: ogreBox, scenery: false })` → `'silhouette'` */
export function sightLevel(context: SightContext, target: SightTarget): SightLevel {
  if (context.mode === 'off') return 'seen';
  let best: SightLevel = 'hidden';
  for (const point of probesOf(target.box)) {
    for (const eye of context.eyes) {
      const level = levelAt(eye, point, context, target.scenery);
      if (LEVEL_RANK[level] > LEVEL_RANK[best]) best = level;
      if (best === 'seen') return best;
    }
  }
  return best;
}

/** Whether any eye sees a door (bright or dim) through the other walls: the door itself never
 *  hides itself. `door` must be the same object as in `context.walls`, or not be there.
 *
 *  Example: `doorSeenBy({ eyes: [torch], walls, mode: 'dark' }, cellarDoor)` → `true` */
export function doorSeenBy(context: SightContext, door: Wall): boolean {
  if (context.mode === 'off') return true;
  const others = { ...context, walls: context.walls.filter((value) => value !== door) };
  return doorProbes(door).some((point) =>
    context.eyes.some((eye) => levelAt(eye, point, others, true) === 'seen'),
  );
}

function levelAt(eye: Eye, point: Vector2, context: SightContext, scenery: boolean): SightLevel {
  const distance = Math.hypot(point.x - eye.center.x, point.y - eye.center.y);
  const inRange = context.mode === 'daylight' ? 'seen' : rangeLevel(eye.range, distance);
  if (inRange === 'hidden' || !lineOfSight(eye.center, point, context.walls)) return 'hidden';
  return scenery ? 'seen' : inRange;
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

function assertRange(side: 'bright' | 'dim', value: number): void {
  if (Number.isFinite(value) && value >= 0 && value <= SIGHT_RANGE_MAX) return;
  throw new RangeError(
    `Sight ${side} ${String(value)} is invalid: expected 0 to ${SIGHT_RANGE_MAX} cells.`,
  );
}
