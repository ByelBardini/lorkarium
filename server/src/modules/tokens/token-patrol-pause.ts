import type { PatrolPauseDto } from '@lorkarium/contracts';
import type { VeiledLightsChange } from '../scenes/board-publisher.port';
import { patrolPoseNowOf } from './token-patrol.bo';
import { toPatrolledToken, toPatrolPauseDto } from './token-patrol.mapper';
import type { PatrolledTokenPo, TokenPatrolWrites } from './token-patrols.dao';
import { veiledLightsCutsOf } from './token-hidden.mapper';
import { sceneVeilOf } from './token-veil.mapper';
import type { TokenRow, TokensDao } from './tokens.dao';

// The pieces the commands that move a token by hand (or put it in combat) share to pause its
// patrol: no layer of its own, like `token-transaction.ts`. A running patrol stands where its
// timeline puts it, so the command acts from that pose, and the pause saves the pose the command
// leaves.

type PatrolDaos = Readonly<{ tokens: Readonly<{ patrols: Pick<TokenPatrolWrites, 'pause'> }> }>;

/** The rows of a command at the pose of now, and the cycle step each running patrol resumes from
 *  (by token id; a token without a running patrol is not in it). */
export type PosedRows = Readonly<{ rows: TokenRow[]; steps: ReadonlyMap<string, number> }>;

/** Each running patrol's token where it is now (cell and, when it turns, facing): what a move,
 *  a turn, a resize or the door seen reads as its origin.
 *
 *  Example: `const posed = posedNowOf(await tokensIn(daos, scene, campaignId, ids), now)` */
export function posedNowOf(rows: readonly TokenRow[], now: Date): PosedRows {
  const steps = new Map<string, number>();
  const posed = rows.map((row) => {
    if (!row.patrol?.startedAt) return row;
    const { pose, step } = patrolPoseNowOf(toPatrolledToken(row), now);
    steps.set(row.token.id, step);
    return { ...row, token: { ...row.token, ...pose } };
  });
  return { rows: posed, steps };
}

/** Pauses the running patrols among `after` (the rows as the command left them): their pose and
 *  the step of `steps` saved in one write; nothing is written when none runs.
 *
 *  Example: `const patrolPauses = await pausePatrolsOf(daos, scene.id, posed.steps, moved)` */
export async function pausePatrolsOf(
  daos: PatrolDaos,
  sceneId: string,
  steps: ReadonlyMap<string, number>,
  after: readonly Pick<TokenRow, 'token'>[],
): Promise<PatrolPauseDto[]> {
  const pauses = after.flatMap(({ token }) => {
    const step = steps.get(token.id);
    if (step === undefined) return [];
    const { id: tokenId, col, row, facing } = token;
    return [{ tokenId, col, row, facing, step }];
  });
  if (pauses.length > 0) await daos.tokens.patrols.pause(sceneId, pauses);
  return pauses.map(toPatrolPauseDto);
}

/** The rows with the patrols `pauses` stopped (a hidden token's veiled light stops walking).
 *
 *  Example: `veiledWriteOf(daos, scene.id, pausedRowsOf(moved, patrolPauses))` */
export function pausedRowsOf(
  rows: readonly TokenRow[],
  pauses: readonly PatrolPauseDto[],
): TokenRow[] {
  const byId = new Map(pauses.map((pause) => [pause.tokenId, pause]));
  return rows.map((row) => {
    const pause = byId.get(row.token.id);
    if (!pause || !row.patrol) return row;
    return { ...row, patrol: { ...row.patrol, step: pause.step, startedAt: null } };
  });
}

/** The event with the patrols it paused; without any, the event as it always was.
 *
 *  Example: `publisher.tokenMoved(withPatrolPauses(event, saved.value.patrolPauses), veil)` */
export function withPatrolPauses<Event extends object>(
  event: Event,
  patrolPauses: readonly PatrolPauseDto[],
): Event & Readonly<{ patrolPauses?: PatrolPauseDto[] }> {
  return patrolPauses.length > 0 ? { ...event, patrolPauses: [...patrolPauses] } : event;
}

/** A command that changes the token's box pauses its patrol (`touches`); one that does not acts
 *  on the stored row and pauses nothing. Returns the row to act on, paused.
 *
 *  Example: `const found = await pausedIfOf(daos, scene.id, stored, now, sizeChanged)` */
export async function pausedIfOf(
  daos: PatrolDaos,
  sceneId: string,
  stored: TokenRow,
  now: Date,
  touches: boolean,
): Promise<Readonly<{ row: TokenRow; patrolPauses: PatrolPauseDto[] }>> {
  if (!touches || !stored.patrol?.startedAt) return { row: stored, patrolPauses: [] };
  const posed = posedNowOf([stored], now);
  const patrolPauses = await pausePatrolsOf(daos, sceneId, posed.steps, posed.rows);
  return { row: pausedRowsOf(posed.rows, patrolPauses)[0] ?? stored, patrolPauses };
}

type EnteringDaos = Readonly<{
  tokens: Pick<TokensDao, 'veilOfScene'> &
    Readonly<{ patrols: Pick<TokenPatrolWrites, 'pause' | 'runningOf'> }>;
}>;

/** What tokens entering a combat paused: the pauses and, when a hidden one gives off light, the
 *  new veiled lights of each audience (`null` = no list changed). */
export type EnteringPauses = Readonly<{
  patrolPauses: PatrolPauseDto[];
  lights: VeiledLightsChange['cuts'] | null;
}>;

/** The tokens that enter a combat stop their patrols where they are now (one read of the running
 *  ones, one write; the veil is read again only when a hidden one paused).
 *
 *  Example: `const paused = await pauseEnteringOf(daos, scene.id, entries.flatMap((e) => e.tokenIds), now)` */
export async function pauseEnteringOf(
  daos: EnteringDaos,
  sceneId: string,
  tokenIds: readonly string[],
  now: Date,
): Promise<EnteringPauses> {
  const running = await daos.tokens.patrols.runningOf(sceneId, tokenIds);
  const pauses = running.map((walker) => pauseOf(walker, now));
  if (pauses.length === 0) return { patrolPauses: [], lights: null };
  await daos.tokens.patrols.pause(sceneId, pauses);
  const patrolPauses = pauses.map(toPatrolPauseDto);
  if (!running.some(({ token }) => token.hidden)) return { patrolPauses, lights: null };
  const after = sceneVeilOf(await daos.tokens.veilOfScene(sceneId));
  const ids = new Set(pauses.map(({ tokenId }) => tokenId));
  const touched = after.tokens.filter(({ tokenId, light }) => ids.has(tokenId) && light);
  return { patrolPauses, lights: touched.length > 0 ? veiledLightsCutsOf(after, touched) : null };
}

function pauseOf(walker: PatrolledTokenPo, now: Date): PatrolPauseDto {
  const { pose, step } = patrolPoseNowOf(toPatrolledToken(walker), now);
  return { tokenId: walker.token.id, ...pose, step };
}
