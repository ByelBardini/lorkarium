import type {
  PatrolPauseDto,
  TokenPatrolChangeDto,
  TokenPatrolDto,
  TokenPatrolFieldsDto,
} from '@lorkarium/contracts';
import { cell, tokenPatrol, type TokenPatrol } from '@lorkarium/game-core';
import { cellsNumeric } from '../../database/cells-numeric';
import type { PatrolledToken, PatrolTimeline, PatrolWrite } from './token-patrol.bo';
import type { PatrolledTokenPo, PatrolPausePo } from './token-patrols.dao';
import type { TokenPatrolPo } from './token-patrols.po';
import { InvalidTokenPatrolError } from './tokens.error';

/** A saved token → what the patrol rule reads of it (`TokenRow` is one).
 *
 *  Example: `bo.start(rows.map(toPatrolledToken), running, now)` */
export function toPatrolledToken({ token, patrol }: PatrolledTokenPo): PatrolledToken {
  const { id: tokenId, col, row, facing, width, height } = token;
  const timeline = patrol && toPatrolTimeline(patrol);
  return { tokenId, pose: { col, row, facing }, size: { width, height }, timeline };
}

/** A stored patrol → its timeline; a route the game-core refuses is a broken table.
 *
 *  Example: `toPatrolTimeline(row.patrol).patrol.speed // 1.5` */
export function toPatrolTimeline(stored: TokenPatrolPo): PatrolTimeline {
  try {
    const path = stored.path.map(([col, row]) => cell(col, row));
    const { repeat, turns } = stored;
    const patrol = tokenPatrol({ path, repeat, speed: Number(stored.speed), turns });
    return { patrol, step: stored.step, startedAt: stored.startedAt };
  } catch (cause) {
    throw new Error(`token ${stored.tokenId} has a patrol saved broken: ${String(cause)}`, {
      cause,
    });
  }
}

/** The route as the master sent it → the game-core patrol; one the DTO lets through and the
 *  game-core refuses (it never leaves its first cell) is INVALID_TOKEN_PATROL.
 *
 *  Example: `toTokenPatrol(command.tokenId, command.patrol).path.length // 2` */
export function toTokenPatrol(tokenId: string, fields: TokenPatrolFieldsDto): TokenPatrol {
  const path = fields.path.map(([col, row]) => ({ col, row }));
  try {
    return tokenPatrol({ path, repeat: fields.repeat, speed: fields.speed, turns: fields.turns });
  } catch (cause) {
    if (cause instanceof RangeError) throw new InvalidTokenPatrolError(tokenId, cause.message);
    throw cause;
  }
}

/** A timeline → the row to save, the speed to the hundredth as `numeric(4,2)` keeps it.
 *
 *  Example: `await daos.tokens.patrols.save(scene.id, toTokenPatrolPo(tokenId, timeline))` */
export function toTokenPatrolPo(tokenId: string, timeline: PatrolTimeline): TokenPatrolPo {
  const { patrol, step, startedAt } = timeline;
  const path = patrol.path.map((point): [number, number] => [point.col, point.row]);
  const { repeat, turns } = patrol;
  return { tokenId, path, repeat, speed: cellsNumeric(patrol.speed), turns, step, startedAt };
}

/** A stored patrol as every audience of the token gets it.
 *
 *  Example: `toTokenPatrolDto(row.patrol).startedAt // '2026-11-08T12:00:00.000Z'` */
export function toTokenPatrolDto(stored: TokenPatrolPo): TokenPatrolDto {
  const { path, repeat, turns, step, startedAt } = stored;
  const points = path.map(([col, row]): [number, number] => [col, row]);
  const started = startedAt && startedAt.toISOString();
  return { path: points, repeat, speed: Number(stored.speed), turns, step, startedAt: started };
}

/** A write → the entry of `token:patrolsChanged`: the patrol now and the pose saved with it.
 *
 *  Example: `writes.map(toPatrolChangeDto)` */
export function toPatrolChangeDto({ tokenId, timeline, pose }: PatrolWrite): TokenPatrolChangeDto {
  const patrol = timeline && toTokenPatrolDto(toTokenPatrolPo(tokenId, timeline));
  return { tokenId, patrol, ...pose };
}

/** A pause → the row the DAO writes (and the event's `patrolPauses` entry, the same shape).
 *
 *  Example: `await daos.tokens.patrols.pause(scene.id, writes.map(toPatrolPausePo))` */
export function toPatrolPausePo({ tokenId, timeline, pose }: PatrolWrite): PatrolPausePo {
  return { tokenId, ...pose, step: timeline?.step ?? 0 };
}

/** A pause as the events carry it.
 *
 *  Example: `{ ...event, patrolPauses: pauses.map(toPatrolPauseDto) }` */
export function toPatrolPauseDto(pause: PatrolPausePo): PatrolPauseDto {
  const { tokenId, col, row, facing, step } = pause;
  return { tokenId, col, row, facing, step };
}

/** A saved row as a patrol write left it: the pose and the patrol (the veiled light of a hidden
 *  token walks with it).
 *
 *  Example: `veiledWriteOf(daos, scene.id, rows.map((row) => withPatrolWrite(row, write)))` */
export function withPatrolWrite<Row extends PatrolledTokenPo>(row: Row, write: PatrolWrite): Row {
  const patrol = write.timeline && toTokenPatrolPo(write.tokenId, write.timeline);
  return { ...row, token: { ...row.token, ...write.pose }, patrol };
}
