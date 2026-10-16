import {
  BOARD_EVENTS,
  boardCommandAckDto,
  type BarChangeDto,
  type ConditionToneDto,
  type CreateTokenCommandDto,
  type SceneGridDto,
  type UpdateTokenCommandDto,
} from '@lorkarium/contracts';
import type { RealtimeTransport } from './realtime-transport';

export type BoardCommandFailure =
  | 'forbidden'
  | 'not_found'
  | 'token_not_found'
  | 'out_of_scene'
  | 'turn_changed'
  | 'combat_active'
  | 'combat_inactive'
  | 'invalid'
  | 'rate_limited'
  | 'unauthenticated'
  | 'offline'
  | 'unexpected';

export type BoardCommandResult =
  Readonly<{ ok: true; version: number }> | Readonly<{ ok: false; failure: BoardCommandFailure }>;

type Envelope = 'actionId' | 'campaignId';
export type NewToken = Omit<CreateTokenCommandDto, Envelope>;
export type TokenEdit = Omit<UpdateTokenCommandDto, Envelope | 'tokenId'>;
export type CellTarget = Readonly<{ col: number; row: number }>;

/** Board commands of an open table; each answers with its ack, never throws. The confirmed
 *  change itself arrives as an event, like everyone else's.
 *
 *  Example: `const result = await boardCommands.moveToken(campaignId, tokenId, { col, row })` */
export interface TableBoardCommands {
  configureScene(campaignId: string, grid: SceneGridDto): Promise<BoardCommandResult>;
  createToken(campaignId: string, token: NewToken): Promise<BoardCommandResult>;
  updateToken(campaignId: string, tokenId: string, edit: TokenEdit): Promise<BoardCommandResult>;
  moveToken(campaignId: string, tokenId: string, to: CellTarget): Promise<BoardCommandResult>;
  adjustBar(
    campaignId: string,
    tokenId: string,
    barId: string,
    change: BarChangeDto,
  ): Promise<BoardCommandResult>;
  deleteToken(campaignId: string, tokenId: string): Promise<BoardCommandResult>;
  defineCondition(
    campaignId: string,
    name: string,
    tone: ConditionToneDto,
  ): Promise<BoardCommandResult>;
  applyCondition(
    campaignId: string,
    tokenId: string,
    conditionId: string,
    rounds: number,
  ): Promise<BoardCommandResult>;
  removeCondition(
    campaignId: string,
    tokenId: string,
    activeConditionId: string,
  ): Promise<BoardCommandResult>;
  startCombat(campaignId: string, tokenIds: readonly string[]): Promise<BoardCommandResult>;
  endCombat(campaignId: string): Promise<BoardCommandResult>;
  addCombatants(campaignId: string, tokenIds: readonly string[]): Promise<BoardCommandResult>;
  removeCombatant(campaignId: string, combatantId: string): Promise<BoardCommandResult>;
  moveInTie(
    campaignId: string,
    combatantId: string,
    direction: 'up' | 'down',
  ): Promise<BoardCommandResult>;
  setInitiative(
    campaignId: string,
    combatantId: string,
    initiative: number | null,
  ): Promise<BoardCommandResult>;
  /** `fromCombatantId`: whose turn the sender saw, so two quick "next" never skip two turns. */
  nextTurn(campaignId: string, fromCombatantId: string): Promise<BoardCommandResult>;
  previousTurn(campaignId: string, fromCombatantId: string): Promise<BoardCommandResult>;
}

// Same patience as the join: past this the command counts as lost.
const COMMAND_ACK_TIMEOUT_MS = 5000;

const FAILURE_BY_CODE: Readonly<Record<string, BoardCommandFailure>> = {
  FORBIDDEN: 'forbidden',
  CAMPAIGN_NOT_FOUND: 'not_found',
  TOKEN_NOT_FOUND: 'token_not_found',
  BAR_NOT_FOUND: 'token_not_found',
  OUT_OF_SCENE: 'out_of_scene',
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

/** `TableBoardCommands` over the same realtime transport as the table session.
 *
 *  Example: `new RealtimeTableBoardCommands(transport, () => crypto.randomUUID())` */
export class RealtimeTableBoardCommands implements TableBoardCommands {
  constructor(
    private readonly transport: RealtimeTransport,
    private readonly newActionId: () => string,
  ) {}

  configureScene(campaignId: string, grid: SceneGridDto): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.configureScene, campaignId, grid);
  }

  createToken(campaignId: string, token: NewToken): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.createToken, campaignId, token);
  }

  updateToken(campaignId: string, tokenId: string, edit: TokenEdit): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.updateToken, campaignId, { tokenId, ...edit });
  }

  moveToken(campaignId: string, tokenId: string, to: CellTarget): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.moveToken, campaignId, { tokenId, col: to.col, row: to.row });
  }

  adjustBar(
    campaignId: string,
    tokenId: string,
    barId: string,
    change: BarChangeDto,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.adjustBar, campaignId, { tokenId, barId, change });
  }

  deleteToken(campaignId: string, tokenId: string): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.deleteToken, campaignId, { tokenId });
  }

  defineCondition(
    campaignId: string,
    name: string,
    tone: ConditionToneDto,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.defineCondition, campaignId, { name, tone });
  }

  applyCondition(
    campaignId: string,
    tokenId: string,
    conditionId: string,
    rounds: number,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.applyCondition, campaignId, { tokenId, conditionId, rounds });
  }

  removeCondition(
    campaignId: string,
    tokenId: string,
    activeConditionId: string,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.removeCondition, campaignId, { tokenId, activeConditionId });
  }

  startCombat(campaignId: string, tokenIds: readonly string[]): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.startCombat, campaignId, { tokenIds: [...tokenIds] });
  }

  endCombat(campaignId: string): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.endCombat, campaignId, {});
  }

  addCombatants(campaignId: string, tokenIds: readonly string[]): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.addCombatants, campaignId, { tokenIds: [...tokenIds] });
  }

  removeCombatant(campaignId: string, combatantId: string): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.removeCombatant, campaignId, { combatantId });
  }

  moveInTie(
    campaignId: string,
    combatantId: string,
    direction: 'up' | 'down',
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.moveInTie, campaignId, { combatantId, direction });
  }

  setInitiative(
    campaignId: string,
    combatantId: string,
    initiative: number | null,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.setInitiative, campaignId, { combatantId, initiative });
  }

  nextTurn(campaignId: string, fromCombatantId: string): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.nextTurn, campaignId, { fromCombatantId });
  }

  previousTurn(campaignId: string, fromCombatantId: string): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.previousTurn, campaignId, { fromCombatantId });
  }

  private async send(
    event: string,
    campaignId: string,
    fields: object,
  ): Promise<BoardCommandResult> {
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
  if (parsed.data.ok) return { ok: true, version: parsed.data.version };
  return { ok: false, failure: FAILURE_BY_CODE[parsed.data.error.code] ?? 'unexpected' };
}
