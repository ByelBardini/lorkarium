import type { Cell } from './cell.vo';
import { facingToward } from './facing';
import type { Facing } from './facing.vo';
import { footprintFits, pathCells, type SceneSize } from './grid';
import type { TokenPatrol } from './token-patrol.vo';
import type { TokenSize } from './token-size.vo';

const MS_PER_SECOND = 1000;

/** Where a patrolling token stands at an instant: the cell (the destination of the step under
 *  way), its facing (`null` when the patrol does not turn: keep the stored one), the cycle step
 *  (`null` while still walking back to the route) and how long until the next step. */
export type PatrolPose = Readonly<{
  cell: Cell;
  facing: Facing | null;
  step: number | null;
  nextStepInMs: number;
}>;

/** A running patrol: the cycle step it left from, the token's cell when it was switched on (where
 *  the walk back starts) and the time since then, by the server's clock. */
export type PatrolInstant = Readonly<{
  patrol: TokenPatrol;
  step: number;
  origin: Cell;
  elapsedMs: number;
}>;

type PatrolRoute = Readonly<{ approach: readonly Cell[]; cycle: readonly Cell[]; step: number }>;
type PatrolStop = Readonly<{ cell: Cell; step: number | null }>;

/** The cells one lap of the patrol walks, one per step: a loop adds the leg back to the first
 *  point (without repeating it); a bounce walks the route and then the same cells backwards
 *  (without repeating either end).
 *
 *  Example: `patrolCycle({ path: [cell(0, 0), cell(3, 0)], repeat: 'bounce' })` → `(0,0) (1,0) (2,0) (3,0) (2,0) (1,0)` */
export function patrolCycle(patrol: Pick<TokenPatrol, 'path' | 'repeat'>): Cell[] {
  return patrol.repeat === 'loop' ? loopCycle(patrol.path) : bounceCycle(patrol.path);
}

function loopCycle(path: readonly Cell[]): Cell[] {
  const [first] = path;
  if (!first) return [];
  return pathCells([...path, first]).slice(0, -1);
}

function bounceCycle(path: readonly Cell[]): Cell[] {
  const there = pathCells(path);
  return [...there, ...there.slice(1, -1).reverse()];
}

/** The pose of a running patrol: step `floor(t × speed)` counts first the walk back from the
 *  origin to the cycle cell `step`, then the cycle from there, in loop. A negative time (a clock
 *  ahead) counts as 0; a step outside the cycle is refused.
 *
 *  Example: `patrolPoseAt({ patrol, step: 0, origin: cell(0, 0), elapsedMs: 2500 })` → `{ cell: (2,0), facing: 0, step: 2, nextStepInMs: 500 }` on a 2 × 2 square at 1 cell/s */
export function patrolPoseAt(instant: PatrolInstant): PatrolPose {
  const route = routeOf(instant);
  const elapsedMs = Math.max(0, instant.elapsedMs);
  const { speed, turns } = instant.patrol;
  const index = Math.floor((elapsedMs * speed) / MS_PER_SECOND);
  const here = stopAt(route, index);
  return Object.freeze({
    cell: here.cell,
    facing: turns ? facingAt(route, index) : null,
    step: here.step,
    nextStepInMs: ((index + 1) * MS_PER_SECOND) / speed - elapsedMs,
  });
}

function routeOf(instant: PatrolInstant): PatrolRoute {
  const cycle = patrolCycle(instant.patrol);
  const target = cycleCellAt(cycle, instant.step);
  const approach = pathCells([instant.origin, target]).slice(0, -1);
  return { approach, cycle, step: instant.step };
}

function cycleCellAt(cycle: readonly Cell[], step: number): Cell {
  const found = Number.isInteger(step) ? cycle[step] : undefined;
  if (found) return found;
  throw new RangeError(
    `Patrol step ${String(step)} is out of range: the cycle has ${String(cycle.length)} cells.`,
  );
}

function stopAt(route: PatrolRoute, index: number): PatrolStop {
  const walkingBack = route.approach[index];
  if (walkingBack) return { cell: walkingBack, step: null };
  const step = (route.step + index - route.approach.length) % route.cycle.length;
  return { cell: cycleCellAt(route.cycle, step), step };
}

// The direction between two cells equals the one between the token's centers there (same offset).
function facingAt(route: PatrolRoute, index: number): Facing | null {
  const from = stopAt(route, Math.max(0, index - 1)).cell;
  const to = stopAt(route, Math.max(1, index)).cell;
  return facingToward({ x: from.col, y: from.row }, { x: to.col, y: to.row });
}

/** The first point of a route where a token of `size` would leave the scene, or `null` when the
 *  whole route fits (the steps lie between the points, so they fit too).
 *
 *  Example: `patrolFits({ widthCells: 20, heightCells: 12 }, [cell(0, 0), cell(19, 0)], tokenSize(2, 2))` → `(19, 0)` */
export function patrolFits(scene: SceneSize, path: readonly Cell[], size: TokenSize): Cell | null {
  return path.find((point) => !footprintFits(scene, point, size)) ?? null;
}
