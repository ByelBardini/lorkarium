import { cell, sameCell, type Cell } from './cell.vo';

/** The most points a patrol route holds (each step of an eye or a torch redraws the fog). */
export const PATROL_POINTS_MAX = 32;
/** The slowest patrol, in cells per second. */
export const PATROL_SPEED_MIN = 0.25;
/** The fastest patrol, in cells per second. */
export const PATROL_SPEED_MAX = 4;
/** The patrol speed moves in quarters of a cell per second. */
export const PATROL_SPEED_STEP = 0.25;

const PATROL_POINTS_MIN = 2;

/** What the token does at the last point: close the circuit (`loop`) or walk back (`bounce`). */
export type PatrolRepeat = 'loop' | 'bounce';

/** A token's patrol: the route as token origins (top-left, half-cell steps), what happens at its
 *  end, the speed in cells per second and whether the token turns to where it walks. */
export type TokenPatrol = Readonly<{
  path: readonly Cell[];
  repeat: PatrolRepeat;
  speed: number;
  turns: boolean;
}>;

/** Builds a patrol, refusing a route of other than 2–32 points, a point off the half-cell steps,
 *  a speed off the 0.25 steps from 0.25 to 4, or a route that never leaves its first cell.
 *
 *  Example: `tokenPatrol({ path: [cell(0, 0), cell(3, 0)], repeat: 'bounce', speed: 1, turns: true })` */
export function tokenPatrol(value: TokenPatrol): TokenPatrol {
  assertPointCount(value.path.length);
  const path = Object.freeze(value.path.map((point) => cell(point.col, point.row)));
  assertSpeed(value.speed);
  assertMoves(path);
  return Object.freeze({ path, repeat: value.repeat, speed: value.speed, turns: value.turns });
}

function assertPointCount(count: number): void {
  if (count >= PATROL_POINTS_MIN && count <= PATROL_POINTS_MAX) return;
  throw new RangeError(
    `Patrol path has ${String(count)} points; expected ${String(PATROL_POINTS_MIN)} to ${String(PATROL_POINTS_MAX)}.`,
  );
}

function assertSpeed(speed: number): void {
  const onStep = Number.isInteger(speed / PATROL_SPEED_STEP);
  if (onStep && speed >= PATROL_SPEED_MIN && speed <= PATROL_SPEED_MAX) return;
  throw new RangeError(
    `Patrol speed ${String(speed)} is invalid: expected ${String(PATROL_SPEED_MIN)} to ${String(PATROL_SPEED_MAX)} in steps of ${String(PATROL_SPEED_STEP)}.`,
  );
}

// A route that never leaves its first cell is the only one whose cycle has fewer than 2 cells.
function assertMoves(path: readonly Cell[]): void {
  const [first] = path;
  if (!first || path.some((point) => !sameCell(point, first))) return;
  const shown = path.map((point) => `(${String(point.col)}, ${String(point.row)})`).join(' → ');
  throw new RangeError(
    `Patrol path ${shown} does not move: expected at least 2 cells in the cycle.`,
  );
}
