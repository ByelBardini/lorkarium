import { TOKEN_LIMIT_CODE, boardCommandAckDto } from '@lorkarium/contracts';
import type { RealtimeTransport } from './realtime-transport';

export type BoardCommandFailure =
  | 'forbidden'
  | 'not_found'
  | 'scene_not_found'
  | 'token_not_found'
  | 'token_limit'
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
  | 'character_already_placed'
  | 'token_not_linked'
  | 'no_free_cells'
  | 'stale_undo'
  | 'asset_not_found'
  | 'turn_changed'
  | 'combat_active'
  | 'combat_inactive'
  | 'name_taken'
  | 'invalid_stacks'
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

/** The raw ack of a command, or that none came in time (a command with an ack of its own). */
export type CommandAnswer =
  Readonly<{ answered: true; ack: unknown }> | Readonly<{ answered: false }>;

/** The grid a command acts on: the table and one of its scenes (the group grid or an open tab). */
export type BoardScope = Readonly<{ campaignId: string; sceneId: string }>;

// Same patience as the join: past this the command counts as lost.
const COMMAND_ACK_TIMEOUT_MS = 5000;

const FAILURE_BY_CODE: Readonly<Record<string, BoardCommandFailure>> = {
  FORBIDDEN: 'forbidden',
  CAMPAIGN_NOT_FOUND: 'not_found',
  SCENE_NOT_FOUND: 'scene_not_found',
  TOKEN_NOT_FOUND: 'token_not_found',
  BAR_NOT_FOUND: 'token_not_found',
  [TOKEN_LIMIT_CODE]: 'token_limit',
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
  CHARACTER_ALREADY_PLACED: 'character_already_placed',
  TOKEN_NOT_LINKED: 'token_not_linked',
  NO_FREE_CELLS: 'no_free_cells',
  STALE_UNDO: 'stale_undo',
  ASSET_NOT_FOUND: 'asset_not_found',
  CONDITION_NOT_FOUND: 'token_not_found',
  CONDITION_NAME_TAKEN: 'name_taken',
  INVALID_STACKS: 'invalid_stacks',
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
 *  Example: `await new BoardCommandSender(transport, newActionId).send('token:moveMany', { campaignId, sceneId }, { moves })` */
export class BoardCommandSender {
  constructor(
    private readonly transport: RealtimeTransport,
    private readonly newActionId: () => string,
  ) {}

  async send(event: string, scope: BoardScope, fields: object): Promise<BoardCommandResult> {
    const answer = await this.ask(event, scope, fields);
    return answer.answered ? resultOf(answer.ack) : { ok: false, failure: 'offline' };
  }

  /** Sends one command and hands back its ack unread, for a command whose ack has its own DTO.
   *
   *  Example: `const answer = await sender.ask('token:addPlayers', scope, { center })` */
  async ask(event: string, scope: BoardScope, fields: object): Promise<CommandAnswer> {
    const { campaignId, sceneId } = scope;
    const payload = { actionId: this.newActionId(), campaignId, sceneId, ...fields };
    try {
      const ack = await this.transport.emitWithAck(event, payload, COMMAND_ACK_TIMEOUT_MS);
      return { answered: true, ack };
    } catch {
      return { answered: false };
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
  return { ok: false, failure: boardFailureOf(parsed.data.error.code) };
}

/** The failure a board refusal code stands for (`unexpected` when unknown).
 *
 *  Example: `boardFailureOf('SCENE_NOT_FOUND') // 'scene_not_found'` */
export function boardFailureOf(code: string): BoardCommandFailure {
  return FAILURE_BY_CODE[code] ?? 'unexpected';
}
