import { WallChecksExceededError } from './walls.error';

/** The wall tests one command may run: about 50 ms of the event loop every table shares. */
export const WALL_CHECKS_PER_COMMAND_MAX = 1_000_000;

// How many points of a door `doorSeenBy` (game-core) looks at.
const DOOR_PROBE_POINTS = 3;

/** Refuses, before the work starts, a command whose worst case passes the budget.
 *
 *  Example: `requireWallChecks(legs * segments)` */
export function requireWallChecks(checks: number): void {
  if (checks > WALL_CHECKS_PER_COMMAND_MAX) {
    throw new WallChecksExceededError(checks, WALL_CHECKS_PER_COMMAND_MAX);
  }
}

/** The worst case of asking whether a door is seen: every light and eye, from each point of it.
 *
 *  Example: `doorSightChecks({ eyes: 2, lights: 40, segments: 4000 }) // 504000` */
export function doorSightChecks(
  count: Readonly<{ eyes: number; lights: number; segments: number }>,
): number {
  return DOOR_PROBE_POINTS * (count.eyes + count.lights) * count.segments;
}
