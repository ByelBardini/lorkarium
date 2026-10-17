import {
  BOARD_EVENTS,
  boardCommandAckDto,
  type BarChangeDto,
  type ConditionToneDto,
  type CreateTokenCommandInput,
  type DrawingShapeInput,
  type SceneGridDto,
  type TokenLayerDto,
  type UpdateTokenCommandDto,
} from '@lorkarium/contracts';
import type { RealtimeTransport } from './realtime-transport';

export type BoardCommandFailure =
  | 'forbidden'
  | 'not_found'
  | 'token_not_found'
  | 'out_of_scene'
  | 'drawing_not_found'
  | 'drawing_limit'
  | 'stale_undo'
  | 'turn_changed'
  | 'combat_active'
  | 'combat_inactive'
  | 'invalid'
  | 'rate_limited'
  | 'unauthenticated'
  | 'offline'
  | 'unexpected';

/** `createdIds` only on a creating command (`createTokens`, `createDrawings`): the ids the server
 *  gave, in the order sent. */
export type BoardCommandResult =
  | Readonly<{ ok: true; version: number; createdIds?: readonly string[] }>
  | Readonly<{ ok: false; failure: BoardCommandFailure }>;

type Envelope = 'actionId' | 'campaignId';
// The input type: a token sent without `layer` lands on `tokens`.
export type NewToken = Omit<CreateTokenCommandInput, Envelope>;
export type TokenEdit = Omit<UpdateTokenCommandDto, Envelope | 'tokenId'>;
export type CellTarget = Readonly<{ col: number; row: number }>;
/** Where one token of a group lands. */
export type TokenPlacement = Readonly<{ tokenId: string; col: number; row: number }>;
/** A token move; `expect` (an undo) is the cell it must still be on, or STALE_UNDO. */
export type TokenMoveTarget = TokenPlacement & Readonly<{ expect?: CellTarget }>;
export type DrawingPosition = Readonly<{ x: number; y: number }>;
/** Where one drawing of a group is (or must still be), in fractional cells. */
export type DrawingPlacement = Readonly<{ drawingId: string }> & DrawingPosition;
/** A drawing move; `expect` (an undo) is where it must still be, or STALE_UNDO. */
export type DrawingMoveTarget = DrawingPlacement & Readonly<{ expect?: DrawingPosition }>;
/** The cell one token of a group is dragged over; `null` ends its drag with no move. */
export type TokenDragTarget = Readonly<{ tokenId: string; cell: CellTarget | null }>;

/** Board commands of an open table; each answers with its ack, never throws. The confirmed
 *  change itself arrives as an event, like everyone else's.
 *
 *  Example: `const result = await boardCommands.moveToken(campaignId, tokenId, { col, row })` */
export interface TableBoardCommands {
  configureScene(campaignId: string, grid: SceneGridDto): Promise<BoardCommandResult>;
  createToken(campaignId: string, token: NewToken): Promise<BoardCommandResult>;
  updateToken(campaignId: string, tokenId: string, edit: TokenEdit): Promise<BoardCommandResult>;
  moveToken(campaignId: string, tokenId: string, to: CellTarget): Promise<BoardCommandResult>;
  /** A group move: all or nothing, in one version. */
  moveTokens(campaignId: string, moves: readonly TokenMoveTarget[]): Promise<BoardCommandResult>;
  /** A paste of tokens (master): all or nothing, in one version. */
  createTokens(campaignId: string, tokens: readonly NewToken[]): Promise<BoardCommandResult>;
  /** Deletes tokens (undoing a paste); `expect` is where each must still be. */
  deleteTokens(
    campaignId: string,
    tokenIds: readonly string[],
    expect?: readonly TokenPlacement[],
  ): Promise<BoardCommandResult>;
  createDrawings(
    campaignId: string,
    drawings: readonly DrawingShapeInput[],
  ): Promise<BoardCommandResult>;
  moveDrawings(
    campaignId: string,
    moves: readonly DrawingMoveTarget[],
  ): Promise<BoardCommandResult>;
  deleteDrawings(
    campaignId: string,
    drawingIds: readonly string[],
    expect?: readonly DrawingPlacement[],
  ): Promise<BoardCommandResult>;
  /** The cells a group (one token is a group of one) is dragged over, for the others to see;
   *  a `null` cell ends that token's drag with no move. Nothing is saved: the ack carries the
   *  version as it stands. */
  dragTokens(campaignId: string, drags: readonly TokenDragTarget[]): Promise<BoardCommandResult>;
  setTokenLayer(
    campaignId: string,
    tokenIds: readonly string[],
    layer: TokenLayerDto,
  ): Promise<BoardCommandResult>;
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
  applyConditions(
    campaignId: string,
    tokenIds: readonly string[],
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
  DRAWING_NOT_FOUND: 'drawing_not_found',
  DRAWING_LIMIT: 'drawing_limit',
  STALE_UNDO: 'stale_undo',
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

  moveTokens(campaignId: string, moves: readonly TokenMoveTarget[]): Promise<BoardCommandResult> {
    const placed = moves.map(({ tokenId, col, row, expect }) => ({
      tokenId,
      col,
      row,
      ...(expect && { expect: { col: expect.col, row: expect.row } }),
    }));
    return this.send(BOARD_EVENTS.moveTokens, campaignId, { moves: placed });
  }

  createTokens(campaignId: string, tokens: readonly NewToken[]): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.createTokens, campaignId, { tokens: [...tokens] });
  }

  deleteTokens(
    campaignId: string,
    tokenIds: readonly string[],
    expect?: readonly TokenPlacement[],
  ): Promise<BoardCommandResult> {
    const precondition = expect && {
      expect: expect.map(({ tokenId, col, row }) => ({ tokenId, col, row })),
    };
    return this.send(BOARD_EVENTS.deleteTokens, campaignId, {
      tokenIds: [...tokenIds],
      ...precondition,
    });
  }

  createDrawings(
    campaignId: string,
    drawings: readonly DrawingShapeInput[],
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.createDrawings, campaignId, { drawings: [...drawings] });
  }

  moveDrawings(
    campaignId: string,
    moves: readonly DrawingMoveTarget[],
  ): Promise<BoardCommandResult> {
    const placed = moves.map(({ drawingId, x, y, expect }) => ({
      drawingId,
      x,
      y,
      ...(expect && { expect: { x: expect.x, y: expect.y } }),
    }));
    return this.send(BOARD_EVENTS.moveDrawings, campaignId, { moves: placed });
  }

  deleteDrawings(
    campaignId: string,
    drawingIds: readonly string[],
    expect?: readonly DrawingPlacement[],
  ): Promise<BoardCommandResult> {
    const precondition = expect && {
      expect: expect.map(({ drawingId, x, y }) => ({ drawingId, x, y })),
    };
    return this.send(BOARD_EVENTS.deleteDrawings, campaignId, {
      drawingIds: [...drawingIds],
      ...precondition,
    });
  }

  dragTokens(campaignId: string, drags: readonly TokenDragTarget[]): Promise<BoardCommandResult> {
    const over = drags.map(({ tokenId, cell }) => ({
      tokenId,
      cell: cell && { col: cell.col, row: cell.row },
    }));
    return this.send(BOARD_EVENTS.dragTokens, campaignId, { drags: over });
  }

  setTokenLayer(
    campaignId: string,
    tokenIds: readonly string[],
    layer: TokenLayerDto,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.setTokenLayer, campaignId, { tokenIds: [...tokenIds], layer });
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

  applyConditions(
    campaignId: string,
    tokenIds: readonly string[],
    conditionId: string,
    rounds: number,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.applyConditions, campaignId, {
      tokenIds: [...tokenIds],
      conditionId,
      rounds,
    });
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
  if (parsed.data.ok) {
    const { version, createdIds } = parsed.data;
    return createdIds ? { ok: true, version, createdIds } : { ok: true, version };
  }
  return { ok: false, failure: FAILURE_BY_CODE[parsed.data.error.code] ?? 'unexpected' };
}
