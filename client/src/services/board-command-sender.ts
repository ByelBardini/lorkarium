import { boardCommandAckDto } from '@lorkarium/contracts';
import type { RealtimeTransport } from './realtime-transport';

export type BoardCommandFailure =
  | 'forbidden'
  | 'not_found'
  | 'token_not_found'
  | 'out_of_scene'
  | 'drawing_not_found'
  | 'drawing_limit'
  | 'effect_area_not_found'
  | 'effect_area_limit'
  | 'wall_not_found'
  | 'wall_limit'
  | 'invalid_door'
  | 'door_locked'
  | 'wall_blocked'
  | 'light_not_found'
  | 'light_limit'
  | 'member_not_found'
  | 'stale_undo'
  | 'asset_not_found'
  | 'turn_changed'
  | 'combat_active'
  | 'combat_inactive'
  | 'invalid'
  | 'rate_limited'
  | 'unauthenticated'
  | 'offline'
  | 'unexpected';

/** `createdIds` only on a creating command (`createTokens`, `createDrawings`, `createEffectAreas`, `eraseWallSegment`,
 *  `createWalls`, `createLights`): the ids the server gave, in the order sent. */
export type BoardCommandResult =
  | Readonly<{ ok: true; version: number; createdIds?: readonly string[] }>
  | Readonly<{ ok: false; failure: BoardCommandFailure }>;

// Same patience as the join: past this the command counts as lost.
const COMMAND_ACK_TIMEOUT_MS = 5000;

const FAILURE_BY_CODE: Readonly<Record<string, BoardCommandFailure>> = {
  FORBIDDEN: 'forbidden',
  CAMPAIGN_NOT_FOUND: 'not_found',
  TOKEN_NOT_FOUND: 'token_not_found',
  BAR_NOT_FOUND: 'token_not_found',
  OUT_OF_SCENE: 'out_of_scene',
  DRAWING_NOT_FOUND: 'drawing_not_found',
  DRAWING_LIMIT: 'drawing_limit',
  EFFECT_AREA_NOT_FOUND: 'effect_area_not_found',
  EFFECT_AREA_LIMIT: 'effect_area_limit',
  WALL_NOT_FOUND: 'wall_not_found',
  WALL_LIMIT: 'wall_limit',
  INVALID_DOOR: 'invalid_door',
  DOOR_LOCKED: 'door_locked',
  WALL_BLOCKED: 'wall_blocked',
  WALL_SEGMENT_NOT_FOUND: 'wall_not_found',
  LIGHT_NOT_FOUND: 'light_not_found',
  LIGHT_LIMIT: 'light_limit',
  MEMBER_NOT_FOUND: 'member_not_found',
  STALE_UNDO: 'stale_undo',
  ASSET_NOT_FOUND: 'asset_not_found',
  CONDITION_NOT_FOUND: 'token_not_found',
  COMBATANT_NOT_FOUND: 'token_not_found',
  TURN_ALREADY_CHANGED: 'turn_changed',
  COMBAT_ALREADY_ACTIVE: 'combat_active',
  COMBAT_NOT_ACTIVE: 'combat_inactive',
  INVALID_BODY: 'invalid',
  INVALID_CONTROLLER: 'invalid',
  RATE_LIMITED: 'rate_limited',
  UNAUTHENTICATED: 'unauthenticated',
};

/** Sends one board command over the realtime transport and turns its ack into a result: a new
 *  action id per command, 5 s of patience (then `offline`), an ack outside the DTO is
 *  `unexpected`, and each refusal code becomes its failure. Never throws.
 *
 *  Example: `await new BoardCommandSender(transport, newActionId).send('token:moveMany', campaignId, { moves })` */
export class BoardCommandSender {
  constructor(
    private readonly transport: RealtimeTransport,
    private readonly newActionId: () => string,
  ) {}

  async send(event: string, campaignId: string, fields: object): Promise<BoardCommandResult> {
    const payload = { actionId: this.newActionId(), campaignId, ...fields };
    try {
      const answer = await this.transport.emitWithAck(event, payload, COMMAND_ACK_TIMEOUT_MS);
      return resultOf(answer);
    } catch {
      return { ok: false, failure: 'offline' };
    }
  }
}

function resultOf(answer: unknown): BoardCommandResult {
  const parsed = boardCommandAckDto.safeParse(answer);
  if (!parsed.success) return { ok: false, failure: 'unexpected' };
  if (parsed.data.ok) {
    const { version, createdIds } = parsed.data;
    return createdIds ? { ok: true, version, createdIds } : { ok: true, version };
  }
  return { ok: false, failure: FAILURE_BY_CODE[parsed.data.error.code] ?? 'unexpected' };
}
