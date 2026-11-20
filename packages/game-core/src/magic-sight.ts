import { REACH_MAX } from './reach';
import { leftOutWith, lineOfSight } from './sight-area';
import {
  sightLevel,
  sightProbesOf,
  type Eye,
  type SightContext,
  type SightLevel,
  type SightTarget,
} from './token-sight';
import { distanceToBox } from './view-field';

/** The longest magic sight, in cells (the widest scene). */
export const MAGIC_SIGHT_RANGE_MAX = REACH_MAX;

// Points are stored to 0.01 cell; the slack keeps a target exactly at the range inside it.
const EDGE_SLACK = 1e-9;

/** Refuses a magic sight range that is not a finite number from 0 to 100 cells.
 *
 *  Example: `magicSightRange(6)` → `6` */
export function magicSightRange(cells: number): number {
  if (Number.isFinite(cells) && cells >= 0 && cells <= MAGIC_SIGHT_RANGE_MAX) return cells;
  throw new RangeError(
    `Magic sight range ${String(cells)} is invalid: expected a number from 0 to ${MAGIC_SIGHT_RANGE_MAX} cells.`,
  );
}

/** How an eye with magic sight up to `range` cells sees an invisible target: as it would see the
 *  same target visible (`sightLevel` with only this eye: `seen` in light or darkvision, a
 *  `silhouette` in dim, scenery whole), when the edge of its footprint is within range; `hidden`
 *  past it. Magic sight only lifts invisibility. With sight `off` the walls still cut. `range` must
 *  come from `magicSightRange`; `context.walls` is the same array the scene prepared.
 *
 *  Example: `magicSightLevel(daylit, mageEye, 6, { box: wolfBox, scenery: false })` → `'seen'` */
export function magicSightLevel(
  context: SightContext,
  eye: Eye,
  range: number,
  target: SightTarget,
): SightLevel {
  if (distanceToBox(target.box, eye.center) > range + EDGE_SLACK) return 'hidden';
  if (context.mode === 'off') return anyProbeInLine(context, eye, target) ? 'seen' : 'hidden';
  return sightLevel({ ...context, eyes: [eye] }, target);
}

function anyProbeInLine(context: SightContext, eye: Eye, target: SightTarget): boolean {
  const leftOut = leftOutWith(target.ignores, eye.ignores);
  return sightProbesOf(target.box).some((point) =>
    lineOfSight(eye.center, point, context.walls, leftOut),
  );
}
