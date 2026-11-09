import { z } from 'zod';
import type { BoardCommandAckDto } from './board.dto';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import { facingDto } from './direction.dto';
import { cellIndexDto } from './half-cell.dto';
import { tokenIdGroupDto } from './token-id-group.dto';

/** Points one patrol route keeps at most (game-core `PATROL_POINTS_MAX`). */
export const TOKEN_PATROL_POINTS_MAX = 32;
/** The patrol speed, in cells per second, from 0.25 to 4 in steps of 0.25 (game-core
 *  `PATROL_SPEED_*`, repeated because contracts depends only on zod). */
export const TOKEN_PATROL_SPEED_MIN = 0.25;
export const TOKEN_PATROL_SPEED_MAX = 4;
export const TOKEN_PATROL_SPEED_STEP = 0.25;
/** Patrols one grid keeps running at most: each step of an eye or a torch redraws the fog. */
export const TOKEN_PATROLS_RUNNING_MAX = 30;
/** The refusal code of starting a token that has no patrol saved. */
export const TOKEN_PATROL_NOT_FOUND_CODE = 'TOKEN_PATROL_NOT_FOUND';
/** The refusal code of a start that would pass `TOKEN_PATROLS_RUNNING_MAX`, all or nothing. */
export const TOKEN_PATROL_LIMIT_CODE = 'TOKEN_PATROL_LIMIT';

/** What the patrol does at its last point: back to the first (`loop`) or the way back (`bounce`). */
export const tokenPatrolRepeatDto = z.enum(['loop', 'bounce']);
export type TokenPatrolRepeatDto = z.infer<typeof tokenPatrolRepeatDto>;

/** How the token shows between two cells: sliding for the whole step (`glide`), or a short move
 *  and a stop on each cell (`step`). The timeline is the same: only the drawing changes. */
export const tokenPatrolGaitDto = z.enum(['glide', 'step']);
export type TokenPatrolGaitDto = z.infer<typeof tokenPatrolGaitDto>;

/** A point of the route: a token origin `[col, row]`, in half cells like `col`/`row`. */
const patrolPointDto = z.tuple([cellIndexDto, cellIndexDto]);

/** 2 to 32 points; whether the cycle leaves the cell is the game-core `tokenPatrol`'s call. */
const patrolPathDto = z.array(patrolPointDto).superRefine((points, context) => {
  if (points.length >= 2 && points.length <= TOKEN_PATROL_POINTS_MAX) return;
  context.addIssue({
    code: 'custom',
    message: `patrol path has ${points.length} points; expected 2 to ${TOKEN_PATROL_POINTS_MAX}`,
  });
});

/** NaN goes through to the refine so the refusal cites it too, as in `coneAngleDto`. */
const patrolSpeedDto = z.union([z.number(), z.nan()]).superRefine((speed, context) => {
  const inRange = speed >= TOKEN_PATROL_SPEED_MIN && speed <= TOKEN_PATROL_SPEED_MAX;
  if (inRange && Number.isInteger(speed / TOKEN_PATROL_SPEED_STEP)) return;
  context.addIssue({
    code: 'custom',
    message: `patrol speed ${speed} is invalid; expected ${TOKEN_PATROL_SPEED_MIN} to ${TOKEN_PATROL_SPEED_MAX} in steps of ${TOKEN_PATROL_SPEED_STEP}`,
  });
});

/** The patrol as the master edits it: the route (the first point is where the token stood when
 *  the editor opened), what it does at the end, how fast it walks, whether it turns to where it
 *  walks and how it shows between two cells.
 *
 *  Example: `tokenPatrolFieldsDto.parse({ path: [[4, 4], [8, 4]], repeat: 'loop', speed: 1, turns: true, gait: 'step' })` */
export const tokenPatrolFieldsDto = z.strictObject({
  path: patrolPathDto,
  repeat: tokenPatrolRepeatDto,
  speed: patrolSpeedDto,
  turns: z.boolean(),
  gait: tokenPatrolGaitDto,
});
export type TokenPatrolFieldsDto = z.infer<typeof tokenPatrolFieldsDto>;

/** A saved patrol as every audience of the token gets it: the route plus its timeline, `step` (the
 *  cell of the cycle it walks from) and `startedAt` (the server clock when it started; `null` =
 *  paused). Each client derives the cell of now from them.
 *
 *  Example: `tokenPatrolDto.parse({ ...fields, step: 0, startedAt: '2026-11-08T12:00:00.000Z' })` */
export const tokenPatrolDto = tokenPatrolFieldsDto.extend({
  step: z.number().int().min(0),
  startedAt: z.iso.datetime().nullable(),
});
export type TokenPatrolDto = z.infer<typeof tokenPatrolDto>;

/** `token:setPatrol` (master): saves the route of one token, or takes it away (`patrol: null`).
 *  Saving over a running patrol restarts it from the first point.
 *
 *  Example: `setTokenPatrolCommandDto.parse({ actionId, campaignId, tokenId, patrol: null })` */
export const setTokenPatrolCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
  patrol: tokenPatrolFieldsDto.nullable(),
});
export type SetTokenPatrolCommandDto = z.infer<typeof setTokenPatrolCommandDto>;

/** `token:setPatrolActiveMany` (master): starts or pauses the patrols of 1 to 64 tokens, all or
 *  nothing (`TOKEN_PATROL_NOT_FOUND`, `TOKEN_PATROL_LIMIT`).
 *
 *  Example: `setTokenPatrolsActiveCommandDto.parse({ actionId, campaignId, tokenIds: [kael], active: true })` */
export const setTokenPatrolsActiveCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenIds: tokenIdGroupDto,
  active: z.boolean(),
});
export type SetTokenPatrolsActiveCommandDto = z.infer<typeof setTokenPatrolsActiveCommandDto>;

const poseShape = { col: cellIndexDto, row: cellIndexDto, facing: facingDto };

/** One token of `token:patrolsChanged`: its patrol now (`null` = taken away) and the pose saved
 *  with it (where a pause left it; while it runs, the origin of the walk back). */
const tokenPatrolChangeDto = z.strictObject({
  tokenId: z.uuid(),
  patrol: tokenPatrolDto.nullable(),
  ...poseShape,
});
export type TokenPatrolChangeDto = z.infer<typeof tokenPatrolChangeDto>;

/** `token:patrolsChanged`: a route saved or taken away, patrols started or paused.
 *
 *  Example: `tokenPatrolsChangedDto.parse(event).changes[0]?.patrol?.startedAt` */
export const tokenPatrolsChangedDto = z.strictObject({
  ...boardEventShape,
  changes: z.array(tokenPatrolChangeDto),
});
export type TokenPatrolsChangedDto = z.infer<typeof tokenPatrolsChangedDto>;

/** Where a command that moves, turns, resizes a token or puts it in combat paused its patrol:
 *  the pose saved and the `step` of the cycle it resumes from.
 *
 *  Example: `patrolPauseDto.parse({ tokenId, col: 2, row: 0, facing: 0, step: 2 })` */
export const patrolPauseDto = z.strictObject({
  tokenId: z.uuid(),
  ...poseShape,
  step: z.number().int().min(0),
});
export type PatrolPauseDto = z.infer<typeof patrolPauseDto>;

/** The patrols an event paused; absent when it paused none (the event as it always was).
 *
 *  Example: `z.strictObject({ ...boardEventShape, tokenId: z.uuid(), ...patrolPausesShape })` */
export const patrolPausesShape = { patrolPauses: z.array(patrolPauseDto).optional() };

type PatrolAck = (answer: BoardCommandAckDto) => void;

/** Client → server commands of the patrol, merged into `BoardClientEvents`. */
export type TokenPatrolClientEvents = {
  'token:setPatrol': (command: SetTokenPatrolCommandDto, ack: PatrolAck) => void;
  'token:setPatrolActiveMany': (command: SetTokenPatrolsActiveCommandDto, ack: PatrolAck) => void;
};

/** Server → room events of the patrol, merged into `BoardServerEvents`. */
export type TokenPatrolServerEvents = {
  'token:patrolsChanged': (event: TokenPatrolsChangedDto) => void;
};
