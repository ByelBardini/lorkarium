import type {
  BarChangeDto,
  DrawingShapeInput,
  SceneGridDto,
  TokenLayerDto,
} from '@lorkarium/contracts';
import type {
  BoardCommandResult,
  CellTarget,
  DrawingMoveTarget,
  DrawingPlacement,
  NewConditionDefinition,
  NewToken,
  TableBoardCommands,
  TokenDragTarget,
  TokenEdit,
  TokenFacingTarget,
  TokenResizeTarget,
  TokenMoveTarget,
  TokenStyle,
  TokenPlacement,
} from '@/services/table-board-commands';
import type {
  EffectAreaReshapeTarget,
  EffectAreaShape,
  EffectAreaShaped,
} from '@/services/effect-area-commands';

export type SentBoardCommand = Readonly<{ name: string; campaignId: string; fields: unknown }>;

/** Board commands as the test plays the server: `sent` keeps each command, `answerWith` sets the
 *  next answer (ok at version 1 by default) and `hold()` keeps the next one pending until
 *  `release()`.
 *
 *  Example: `deps.boardCommands.answerWith({ ok: false, failure: 'forbidden' })` */
export class TableBoardCommandsFake implements TableBoardCommands {
  readonly sent: SentBoardCommand[] = [];
  private answer: BoardCommandResult = { ok: true, version: 1 };
  private held: ((result: BoardCommandResult) => void) | null = null;
  private holdNext = false;

  answerWith(result: BoardCommandResult): void {
    this.answer = result;
  }

  hold(): void {
    this.holdNext = true;
  }

  release(): void {
    this.held?.(this.answer);
    this.held = null;
  }

  configureScene(
    campaignId: string,
    grid: SceneGridDto,
    backgroundAssetId?: string | null,
  ): Promise<BoardCommandResult> {
    const background = backgroundAssetId === undefined ? {} : { backgroundAssetId };
    return this.record('configureScene', campaignId, { ...grid, ...background });
  }

  createToken(campaignId: string, token: NewToken): Promise<BoardCommandResult> {
    return this.record('createToken', campaignId, token);
  }

  updateToken(campaignId: string, tokenId: string, edit: TokenEdit): Promise<BoardCommandResult> {
    return this.record('updateToken', campaignId, { tokenId, ...edit });
  }

  moveToken(campaignId: string, tokenId: string, to: CellTarget): Promise<BoardCommandResult> {
    return this.record('moveToken', campaignId, { tokenId, ...to });
  }

  moveTokens(campaignId: string, moves: readonly TokenMoveTarget[]): Promise<BoardCommandResult> {
    return this.record('moveTokens', campaignId, { moves: [...moves] });
  }

  createTokens(campaignId: string, tokens: readonly NewToken[]): Promise<BoardCommandResult> {
    return this.record('createTokens', campaignId, { tokens: [...tokens] });
  }

  deleteTokens(
    campaignId: string,
    tokenIds: readonly string[],
    expect?: readonly TokenPlacement[],
  ): Promise<BoardCommandResult> {
    return this.record('deleteTokens', campaignId, { tokenIds: [...tokenIds], expect });
  }

  createDrawings(
    campaignId: string,
    drawings: readonly DrawingShapeInput[],
  ): Promise<BoardCommandResult> {
    return this.record('createDrawings', campaignId, { drawings: [...drawings] });
  }

  moveDrawings(
    campaignId: string,
    moves: readonly DrawingMoveTarget[],
  ): Promise<BoardCommandResult> {
    return this.record('moveDrawings', campaignId, { moves: [...moves] });
  }

  deleteDrawings(
    campaignId: string,
    drawingIds: readonly string[],
    expect?: readonly DrawingPlacement[],
  ): Promise<BoardCommandResult> {
    return this.record('deleteDrawings', campaignId, { drawingIds: [...drawingIds], expect });
  }

  createEffectAreas(
    campaignId: string,
    shapes: readonly EffectAreaShape[],
  ): Promise<BoardCommandResult> {
    return this.record('createEffectAreas', campaignId, { effectAreas: [...shapes] });
  }

  reshapeEffectAreas(
    campaignId: string,
    reshapes: readonly EffectAreaReshapeTarget[],
  ): Promise<BoardCommandResult> {
    return this.record('reshapeEffectAreas', campaignId, { reshapes: [...reshapes] });
  }

  deleteEffectAreas(
    campaignId: string,
    effectAreaIds: readonly string[],
    expect?: readonly EffectAreaShaped[],
  ): Promise<BoardCommandResult> {
    return this.record('deleteEffectAreas', campaignId, {
      effectAreaIds: [...effectAreaIds],
      expect,
    });
  }

  dragTokens(campaignId: string, drags: readonly TokenDragTarget[]): Promise<BoardCommandResult> {
    return this.record('dragTokens', campaignId, { drags: [...drags] });
  }

  setTokenLayer(
    campaignId: string,
    tokenIds: readonly string[],
    layer: TokenLayerDto,
  ): Promise<BoardCommandResult> {
    return this.record('setTokenLayer', campaignId, { tokenIds: [...tokenIds], layer });
  }

  faceTokens(campaignId: string, faces: readonly TokenFacingTarget[]): Promise<BoardCommandResult> {
    return this.record('faceTokens', campaignId, { faces: [...faces] });
  }

  resizeTokens(
    campaignId: string,
    resizes: readonly TokenResizeTarget[],
  ): Promise<BoardCommandResult> {
    return this.record('resizeTokens', campaignId, { resizes: [...resizes] });
  }

  restyleTokens(
    campaignId: string,
    tokenIds: readonly string[],
    style: TokenStyle,
  ): Promise<BoardCommandResult> {
    return this.record('restyleTokens', campaignId, { tokenIds: [...tokenIds], style });
  }

  adjustBar(
    campaignId: string,
    tokenId: string,
    barId: string,
    change: BarChangeDto,
  ): Promise<BoardCommandResult> {
    return this.record('adjustBar', campaignId, { tokenId, barId, change });
  }

  deleteToken(campaignId: string, tokenId: string): Promise<BoardCommandResult> {
    return this.record('deleteToken', campaignId, { tokenId });
  }

  defineCondition(
    campaignId: string,
    definition: NewConditionDefinition,
  ): Promise<BoardCommandResult> {
    return this.record('defineCondition', campaignId, { ...definition });
  }

  applyCondition(
    campaignId: string,
    tokenId: string,
    conditionId: string,
    rounds: number,
  ): Promise<BoardCommandResult> {
    return this.record('applyCondition', campaignId, { tokenId, conditionId, rounds });
  }

  applyConditions(
    campaignId: string,
    tokenIds: readonly string[],
    conditionId: string,
    rounds: number,
  ): Promise<BoardCommandResult> {
    return this.record('applyConditions', campaignId, {
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
    return this.record('removeCondition', campaignId, { tokenId, activeConditionId });
  }

  startCombat(campaignId: string, tokenIds: readonly string[]): Promise<BoardCommandResult> {
    return this.record('startCombat', campaignId, { tokenIds: [...tokenIds] });
  }

  endCombat(campaignId: string): Promise<BoardCommandResult> {
    return this.record('endCombat', campaignId, {});
  }

  addCombatants(campaignId: string, tokenIds: readonly string[]): Promise<BoardCommandResult> {
    return this.record('addCombatants', campaignId, { tokenIds: [...tokenIds] });
  }

  removeCombatant(campaignId: string, combatantId: string): Promise<BoardCommandResult> {
    return this.record('removeCombatant', campaignId, { combatantId });
  }

  moveInTie(
    campaignId: string,
    combatantId: string,
    direction: 'up' | 'down',
  ): Promise<BoardCommandResult> {
    return this.record('moveInTie', campaignId, { combatantId, direction });
  }

  setInitiative(
    campaignId: string,
    combatantId: string,
    initiative: number | null,
  ): Promise<BoardCommandResult> {
    return this.record('setInitiative', campaignId, { combatantId, initiative });
  }

  nextTurn(campaignId: string, fromCombatantId: string): Promise<BoardCommandResult> {
    return this.record('nextTurn', campaignId, { fromCombatantId });
  }

  previousTurn(campaignId: string, fromCombatantId: string): Promise<BoardCommandResult> {
    return this.record('previousTurn', campaignId, { fromCombatantId });
  }

  /** The commands sent with this name, in order. */
  sentAs(name: string): SentBoardCommand[] {
    return this.sent.filter((command) => command.name === name);
  }

  private record(name: string, campaignId: string, fields: unknown): Promise<BoardCommandResult> {
    this.sent.push({ name, campaignId, fields });
    if (!this.holdNext) return Promise.resolve(this.answer);
    this.holdNext = false;
    return new Promise((resolve) => {
      this.held = resolve;
    });
  }
}
