import type {
  BarChangeDto,
  CombatEntryInput,
  DrawingShapeInput,
  CharacterChangesInput,
  SceneGridDto,
  SceneVisionDto,
  TokenLayerDto,
} from '@lorkarium/contracts';
import type {
  BoardCommandResult,
  BoardScope,
  TableScope,
  CellTarget,
  ConditionDefinitionEdit,
  ConditionUsageResult,
  DrawingMoveTarget,
  DrawingPlacement,
  NewConditionDefinition,
  NewToken,
  TableBoardCommands,
  TokenDragTarget,
  TokenEdit,
  TokenFacingTarget,
  TokenFormTarget,
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
import type {
  DoorState,
  WallKind,
  WallKindOf,
  WallEraseBox,
  WallPosition,
  WallPlacement,
  WallShape,
} from '@/services/wall-commands';
import type {
  LightAt,
  LightMoveTarget,
  LightPlacement,
  LightColorTarget,
  LightConeTarget,
  LightRangeTarget,
} from '@/services/light-commands';
import type { RegroupTarget } from '@/services/combat-commands';
import type { AddPlayersResult } from '@/services/token-link-commands';

/** `sceneId` is absent for a command of the table itself (the condition list's). */
export type SentBoardCommand = Readonly<{
  name: string;
  campaignId: string;
  sceneId?: string;
  fields: unknown;
}>;

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
  private playersAnswer: AddPlayersResult | null = null;
  private usageTokens = 0;

  answerWith(result: BoardCommandResult): void {
    this.answer = result;
  }

  /** The next `addPlayers` answers this (else: the `answerWith` failure, or nobody placed). */
  answerAddPlayersWith(result: AddPlayersResult): void {
    this.playersAnswer = result;
  }

  /** The next `conditionUsage` that is answered ok counts this many tokens (0 by default). */
  answerUsageWith(tokens: number): void {
    this.usageTokens = tokens;
  }

  hold(): void {
    this.holdNext = true;
  }

  release(): void {
    this.held?.(this.answer);
    this.held = null;
  }

  configureScene(
    scope: BoardScope,
    grid: SceneGridDto,
    backgroundAssetId?: string | null,
    vision?: SceneVisionDto,
  ): Promise<BoardCommandResult> {
    const background = backgroundAssetId === undefined ? {} : { backgroundAssetId };
    const mode = vision === undefined ? {} : { vision };
    return this.record('configureScene', scope, { ...grid, ...background, ...mode });
  }

  createToken(scope: BoardScope, token: NewToken): Promise<BoardCommandResult> {
    return this.record('createToken', scope, token);
  }

  updateToken(scope: BoardScope, tokenId: string, edit: TokenEdit): Promise<BoardCommandResult> {
    return this.record('updateToken', scope, { tokenId, ...edit });
  }

  moveToken(
    scope: BoardScope,
    tokenId: string,
    to: CellTarget,
    path?: readonly CellTarget[],
  ): Promise<BoardCommandResult> {
    const bends = path && path.length > 0 ? { path: [...path] } : {};
    return this.record('moveToken', scope, { tokenId, ...to, ...bends });
  }

  moveTokens(scope: BoardScope, moves: readonly TokenMoveTarget[]): Promise<BoardCommandResult> {
    return this.record('moveTokens', scope, { moves: [...moves] });
  }

  createTokens(scope: BoardScope, tokens: readonly NewToken[]): Promise<BoardCommandResult> {
    return this.record('createTokens', scope, { tokens: [...tokens] });
  }

  deleteTokens(
    scope: BoardScope,
    tokenIds: readonly string[],
    expect?: readonly TokenPlacement[],
  ): Promise<BoardCommandResult> {
    return this.record('deleteTokens', scope, { tokenIds: [...tokenIds], expect });
  }

  createDrawings(
    scope: BoardScope,
    drawings: readonly DrawingShapeInput[],
  ): Promise<BoardCommandResult> {
    return this.record('createDrawings', scope, { drawings: [...drawings] });
  }

  moveDrawings(
    scope: BoardScope,
    moves: readonly DrawingMoveTarget[],
  ): Promise<BoardCommandResult> {
    return this.record('moveDrawings', scope, { moves: [...moves] });
  }

  deleteDrawings(
    scope: BoardScope,
    drawingIds: readonly string[],
    expect?: readonly DrawingPlacement[],
  ): Promise<BoardCommandResult> {
    return this.record('deleteDrawings', scope, { drawingIds: [...drawingIds], expect });
  }

  createWalls(scope: BoardScope, shapes: readonly WallShape[]): Promise<BoardCommandResult> {
    return this.record('createWalls', scope, { walls: [...shapes] });
  }

  eraseWallArea(scope: BoardScope, box: WallEraseBox): Promise<BoardCommandResult> {
    return this.record('eraseWallArea', scope, { box: { ...box } });
  }

  eraseWallSegment(
    scope: BoardScope,
    wallId: string,
    segmentIndex: number,
    expect?: WallPosition,
  ): Promise<BoardCommandResult> {
    return this.record('eraseWallSegment', scope, { wallId, segmentIndex, expect });
  }

  deleteWalls(
    scope: BoardScope,
    wallIds: readonly string[],
    expect?: readonly WallPlacement[],
  ): Promise<BoardCommandResult> {
    return this.record('deleteWalls', scope, { wallIds: [...wallIds], expect });
  }

  setWallKinds(
    scope: BoardScope,
    wallIds: readonly string[],
    kind: WallKind,
    expect?: readonly WallKindOf[],
  ): Promise<BoardCommandResult> {
    return this.record('setWallKinds', scope, { wallIds: [...wallIds], kind, expect });
  }

  setDoor(scope: BoardScope, wallId: string, state: DoorState): Promise<BoardCommandResult> {
    return this.record('setDoor', scope, { wallId, state });
  }

  createLights(scope: BoardScope, lights: readonly LightPlacement[]): Promise<BoardCommandResult> {
    return this.record('createLights', scope, { lights: [...lights] });
  }

  moveLights(scope: BoardScope, moves: readonly LightMoveTarget[]): Promise<BoardCommandResult> {
    return this.record('moveLights', scope, { moves: [...moves] });
  }

  setLightRanges(
    scope: BoardScope,
    changes: readonly LightRangeTarget[],
  ): Promise<BoardCommandResult> {
    return this.record('setLightRanges', scope, { changes: [...changes] });
  }

  setLightColors(
    scope: BoardScope,
    changes: readonly LightColorTarget[],
  ): Promise<BoardCommandResult> {
    return this.record('setLightColors', scope, { changes: [...changes] });
  }

  setLightCones(
    scope: BoardScope,
    changes: readonly LightConeTarget[],
  ): Promise<BoardCommandResult> {
    return this.record('setLightCones', scope, { changes: [...changes] });
  }

  setLightsLit(
    scope: BoardScope,
    lightIds: readonly string[],
    lit: boolean,
  ): Promise<BoardCommandResult> {
    return this.record('setLightsLit', scope, { lightIds: [...lightIds], lit });
  }

  setTokensHidden(
    scope: BoardScope,
    ids: readonly string[],
    hidden: boolean,
  ): Promise<BoardCommandResult> {
    return this.record('setTokensHidden', scope, { tokenIds: [...ids], hidden });
  }

  setTokenForm(scope: BoardScope, target: TokenFormTarget): Promise<BoardCommandResult> {
    return this.record('setTokenForm', scope, { ...target });
  }

  updateCharacter(
    scope: BoardScope,
    characterId: string,
    changes: CharacterChangesInput,
  ): Promise<BoardCommandResult> {
    return this.record('updateCharacter', scope, { characterId, changes });
  }

  adjustCharacterBar(
    scope: BoardScope,
    characterId: string,
    barId: string,
    change: BarChangeDto,
  ): Promise<BoardCommandResult> {
    return this.record('adjustCharacterBar', scope, { characterId, barId, change });
  }

  setMainSheet(
    scope: BoardScope,
    characterId: string,
    sheetId: string,
  ): Promise<BoardCommandResult> {
    return this.record('setMainSheet', scope, { characterId, sheetId });
  }

  deleteLights(
    scope: BoardScope,
    lightIds: readonly string[],
    expect?: readonly LightAt[],
  ): Promise<BoardCommandResult> {
    return this.record('deleteLights', scope, { lightIds: [...lightIds], expect });
  }

  createEffectAreas(
    scope: BoardScope,
    shapes: readonly EffectAreaShape[],
  ): Promise<BoardCommandResult> {
    return this.record('createEffectAreas', scope, { effectAreas: [...shapes] });
  }

  reshapeEffectAreas(
    scope: BoardScope,
    reshapes: readonly EffectAreaReshapeTarget[],
  ): Promise<BoardCommandResult> {
    return this.record('reshapeEffectAreas', scope, { reshapes: [...reshapes] });
  }

  deleteEffectAreas(
    scope: BoardScope,
    effectAreaIds: readonly string[],
    expect?: readonly EffectAreaShaped[],
  ): Promise<BoardCommandResult> {
    return this.record('deleteEffectAreas', scope, {
      effectAreaIds: [...effectAreaIds],
      expect,
    });
  }

  dragTokens(scope: BoardScope, drags: readonly TokenDragTarget[]): Promise<BoardCommandResult> {
    return this.record('dragTokens', scope, { drags: [...drags] });
  }

  setTokenLayer(
    scope: BoardScope,
    tokenIds: readonly string[],
    layer: TokenLayerDto,
  ): Promise<BoardCommandResult> {
    return this.record('setTokenLayer', scope, { tokenIds: [...tokenIds], layer });
  }

  faceTokens(scope: BoardScope, faces: readonly TokenFacingTarget[]): Promise<BoardCommandResult> {
    return this.record('faceTokens', scope, { faces: [...faces] });
  }

  resizeTokens(
    scope: BoardScope,
    resizes: readonly TokenResizeTarget[],
  ): Promise<BoardCommandResult> {
    return this.record('resizeTokens', scope, { resizes: [...resizes] });
  }

  restyleTokens(
    scope: BoardScope,
    tokenIds: readonly string[],
    style: TokenStyle,
  ): Promise<BoardCommandResult> {
    return this.record('restyleTokens', scope, { tokenIds: [...tokenIds], style });
  }

  adjustBar(
    scope: BoardScope,
    tokenId: string,
    barId: string,
    change: BarChangeDto,
  ): Promise<BoardCommandResult> {
    return this.record('adjustBar', scope, { tokenId, barId, change });
  }

  deleteToken(scope: BoardScope, tokenId: string): Promise<BoardCommandResult> {
    return this.record('deleteToken', scope, { tokenId });
  }

  defineCondition(
    scope: TableScope,
    definition: NewConditionDefinition,
  ): Promise<BoardCommandResult> {
    return this.record('defineCondition', scope, { ...definition });
  }

  updateConditionDefinition(
    scope: TableScope,
    edit: ConditionDefinitionEdit,
  ): Promise<BoardCommandResult> {
    return this.record('updateConditionDefinition', scope, { ...edit });
  }

  deleteConditionDefinition(scope: TableScope, conditionId: string): Promise<BoardCommandResult> {
    return this.record('deleteConditionDefinition', scope, { conditionId });
  }

  restoreDefaultConditions(scope: TableScope): Promise<BoardCommandResult> {
    return this.record('restoreDefaultConditions', scope, {});
  }

  async conditionUsage(scope: TableScope, conditionId: string): Promise<ConditionUsageResult> {
    const answer = await this.record('conditionUsage', scope, { conditionId });
    return answer.ok ? { ok: true, tokens: this.usageTokens } : answer;
  }

  applyCondition(
    scope: BoardScope,
    tokenId: string,
    conditionId: string,
    rounds: number,
  ): Promise<BoardCommandResult> {
    return this.record('applyCondition', scope, { tokenId, conditionId, rounds });
  }

  applyConditions(
    scope: BoardScope,
    tokenIds: readonly string[],
    conditionId: string,
    rounds: number,
  ): Promise<BoardCommandResult> {
    return this.record('applyConditions', scope, {
      tokenIds: [...tokenIds],
      conditionId,
      rounds,
    });
  }

  removeCondition(
    scope: BoardScope,
    tokenId: string,
    activeConditionId: string,
  ): Promise<BoardCommandResult> {
    return this.record('removeCondition', scope, { tokenId, activeConditionId });
  }

  setConditionRounds(
    scope: BoardScope,
    tokenId: string,
    activeConditionId: string,
    rounds: number,
  ): Promise<BoardCommandResult> {
    return this.record('setConditionRounds', scope, { tokenId, activeConditionId, rounds });
  }

  setConditionStacks(
    scope: BoardScope,
    tokenId: string,
    activeConditionId: string,
    stacks: number,
  ): Promise<BoardCommandResult> {
    return this.record('setConditionStacks', scope, { tokenId, activeConditionId, stacks });
  }

  startCombat(
    scope: BoardScope,
    entries: readonly CombatEntryInput[],
  ): Promise<BoardCommandResult> {
    return this.record('startCombat', scope, { entries: [...entries] });
  }

  endCombat(scope: BoardScope): Promise<BoardCommandResult> {
    return this.record('endCombat', scope, {});
  }

  addCombatants(
    scope: BoardScope,
    entries: readonly CombatEntryInput[],
  ): Promise<BoardCommandResult> {
    return this.record('addCombatants', scope, { entries: [...entries] });
  }

  regroupTokens(
    scope: BoardScope,
    tokenIds: readonly string[],
    target: RegroupTarget,
  ): Promise<BoardCommandResult> {
    return this.record('regroupTokens', scope, { tokenIds: [...tokenIds], target });
  }

  renameCombatant(
    scope: BoardScope,
    combatantId: string,
    name: string,
  ): Promise<BoardCommandResult> {
    return this.record('renameCombatant', scope, { combatantId, name });
  }

  removeCombatant(scope: BoardScope, combatantId: string): Promise<BoardCommandResult> {
    return this.record('removeCombatant', scope, { combatantId });
  }

  moveInTie(
    scope: BoardScope,
    combatantId: string,
    direction: 'up' | 'down',
  ): Promise<BoardCommandResult> {
    return this.record('moveInTie', scope, { combatantId, direction });
  }

  setInitiative(
    scope: BoardScope,
    combatantId: string,
    initiative: number | null,
  ): Promise<BoardCommandResult> {
    return this.record('setInitiative', scope, { combatantId, initiative });
  }

  nextTurn(scope: BoardScope, fromCombatantId: string): Promise<BoardCommandResult> {
    return this.record('nextTurn', scope, { fromCombatantId });
  }

  previousTurn(scope: BoardScope, fromCombatantId: string): Promise<BoardCommandResult> {
    return this.record('previousTurn', scope, { fromCombatantId });
  }

  linkTokenToCharacter(
    scope: BoardScope,
    tokenId: string,
    characterId: string,
  ): Promise<BoardCommandResult> {
    return this.record('linkTokenToCharacter', scope, { tokenId, characterId });
  }

  unlinkTokenFromCharacter(scope: BoardScope, tokenId: string): Promise<BoardCommandResult> {
    return this.record('unlinkTokenFromCharacter', scope, { tokenId });
  }

  async addPlayers(scope: BoardScope, center: CellTarget): Promise<AddPlayersResult> {
    const answer = await this.record('addPlayers', scope, { center });
    if (this.playersAnswer) return this.playersAnswer;
    if (!answer.ok) return answer;
    return { ok: true, version: answer.version, createdIds: [], skippedMemberIds: [] };
  }

  /** The commands sent with this name, in order. */
  sentAs(name: string): SentBoardCommand[] {
    return this.sent.filter((command) => command.name === name);
  }

  private record(
    name: string,
    scope: BoardScope | TableScope,
    fields: unknown,
  ): Promise<BoardCommandResult> {
    const grid = 'sceneId' in scope ? { sceneId: scope.sceneId } : {};
    this.sent.push({ name, campaignId: scope.campaignId, ...grid, fields });
    if (!this.holdNext) return Promise.resolve(this.answer);
    this.holdNext = false;
    return new Promise((resolve) => {
      this.held = resolve;
    });
  }
}
