import type { TokenDto, TokenPatrolDto, VeiledLightDto } from '@lorkarium/contracts';
import { cell, patrolPoseAt, type PatrolPose, type TokenPatrol } from '@lorkarium/game-core';

/** Where a patrolling token shows now: the cell of the step under way, where it looks (`null`:
 *  the patrol does not turn, the token keeps its own facing) and how long one step glides. */
export type PatrolShownPose = Readonly<{
  col: number;
  row: number;
  facing: number | null;
  glideMs: number;
}>;

/** The poses of the running patrols of a board, by token id. */
export type PatrolPoses = ReadonlyMap<string, PatrolShownPose>;

/** The patrols of a board at one instant: the token poses, the veiled lights where they shine
 *  (the very board array when none walks) and how long until the next step (`null`: none runs). */
export type PatrolClock = Readonly<{
  poses: PatrolPoses;
  veiledLights: VeiledLightDto[];
  nextChangeInMs: number | null;
}>;

/** What a board with no running patrol shows. */
export const IDLE_PATROLS: PatrolClock = {
  poses: new Map(),
  veiledLights: [],
  nextChangeInMs: null,
};

/** What the clock reads of a board, at the server time `serverNowMs`. */
export type PatrolBoard = Readonly<{
  tokens: readonly TokenDto[];
  veiledLights: VeiledLightDto[];
  serverNowMs: number;
}>;

const MS_PER_SECOND = 1000;

/** The poses of every running patrol at the server time `serverNowMs`, by the game-core's
 *  `patrolPoseAt`. A pose map (and a veiled lights array) equal to the `previous` one comes back
 *  as that very object, so the sight memo, keyed by identity, holds.
 *
 *  Example: `patrolClockOf({ tokens, veiledLights, serverNowMs }, IDLE_PATROLS).poses.get(kaelId)` */
export function patrolClockOf(board: PatrolBoard, previous: PatrolClock): PatrolClock {
  const next: number[] = [];
  const poses = sameOr(previous.poses, tokenPosesOf(board, next));
  const veiledLights = walkedLightsOf(board, previous, next);
  const nextChangeInMs = next.length > 0 ? Math.min(...next) : null;
  return { poses, veiledLights, nextChangeInMs };
}

/** The veiled lights as they shine now: the walked ones of the patrol clock, or the board's own
 *  when there is no clock yet (`IDLE_PATROLS` or absent).
 *
 *  Example: `shownVeiledLightsOf(board.veiledLights, state.patrol)` */
export function shownVeiledLightsOf(
  veiledLights: VeiledLightDto[],
  patrol: PatrolClock | undefined,
): VeiledLightDto[] {
  return !patrol || patrol === IDLE_PATROLS ? veiledLights : patrol.veiledLights;
}

/** The token as it shows on patrol: its cell, and its facing when the patrol turns it; the very
 *  token when it has no pose.
 *
 *  Example: `posedTokenOf(token, board.patrol.poses).col` */
export function posedTokenOf(token: TokenDto, poses: PatrolPoses): TokenDto {
  const pose = poses.get(token.id);
  if (!pose) return token;
  return { ...token, col: pose.col, row: pose.row, facing: pose.facing ?? token.facing };
}

function tokenPosesOf(board: PatrolBoard, next: number[]): Map<string, PatrolShownPose> {
  const poses = new Map<string, PatrolShownPose>();
  for (const token of board.tokens) {
    const pose = token.patrol && poseNowOf(token.patrol, token, board.serverNowMs);
    if (!pose || !token.patrol) continue;
    next.push(pose.nextStepInMs);
    poses.set(token.id, shownPoseOf(pose, token.patrol));
  }
  return poses;
}

function walkedLightsOf(
  board: PatrolBoard,
  previous: PatrolClock,
  next: number[],
): VeiledLightDto[] {
  if (!board.veiledLights.some(({ walk }) => walk?.patrol.startedAt)) return board.veiledLights;
  const walked = board.veiledLights.map((light) => walkedLightOf(light, board.serverNowMs, next));
  const same =
    walked.length === previous.veiledLights.length &&
    walked.every((light, index) => sameLight(light, previous.veiledLights[index]));
  return same ? previous.veiledLights : walked;
}

function walkedLightOf(light: VeiledLightDto, serverNowMs: number, next: number[]): VeiledLightDto {
  const { walk } = light;
  const pose = walk && poseNowOf(walk.patrol, walk, serverNowMs);
  if (!walk || !pose) return light;
  next.push(pose.nextStepInMs);
  const x = pose.cell.col + walk.width / 2;
  const y = pose.cell.row + walk.height / 2;
  return { ...light, x, y, facing: pose.facing ?? light.facing };
}

// A step the cycle does not have (a stray value from the server) leaves the token where it was
// saved, rather than taking the board down.
function poseNowOf(
  patrol: TokenPatrolDto,
  origin: Readonly<{ col: number; row: number }>,
  serverNowMs: number,
): PatrolPose | null {
  if (patrol.startedAt === null) return null;
  const elapsedMs = serverNowMs - Date.parse(patrol.startedAt);
  const instant = {
    patrol: patrolOf(patrol),
    step: patrol.step,
    origin: cell(origin.col, origin.row),
    elapsedMs,
  };
  try {
    return patrolPoseAt(instant);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

// The route as game-core cells, once per patrol received (the DTO object is replaced on change).
const routes = new WeakMap<TokenPatrolDto, TokenPatrol>();

function patrolOf(patrol: TokenPatrolDto): TokenPatrol {
  const known = routes.get(patrol);
  if (known) return known;
  const path = patrol.path.map(([col, row]) => cell(col, row));
  const route = { path, repeat: patrol.repeat, speed: patrol.speed, turns: patrol.turns };
  routes.set(patrol, route);
  return route;
}

function shownPoseOf(pose: PatrolPose, patrol: TokenPatrolDto): PatrolShownPose {
  const glideMs = MS_PER_SECOND / patrol.speed;
  return { col: pose.cell.col, row: pose.cell.row, facing: pose.facing, glideMs };
}

function sameOr(previous: PatrolPoses, poses: Map<string, PatrolShownPose>): PatrolPoses {
  if (poses.size === 0) return IDLE_PATROLS.poses;
  if (poses.size !== previous.size) return poses;
  for (const [id, pose] of poses) if (!samePose(pose, previous.get(id))) return poses;
  return previous;
}

function samePose(pose: PatrolShownPose, other: PatrolShownPose | undefined): boolean {
  if (!other) return false;
  const { col, row, facing, glideMs } = other;
  return pose.col === col && pose.row === row && pose.facing === facing && pose.glideMs === glideMs;
}

// Field by field: a new list from the server (a color, a range) brings new `walk` objects too.
function sameLight(light: VeiledLightDto, other: VeiledLightDto | undefined): boolean {
  if (!other) return false;
  const keys = Object.keys(light) as (keyof VeiledLightDto)[];
  return (
    keys.length === Object.keys(other).length && keys.every((key) => light[key] === other[key])
  );
}
