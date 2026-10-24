import {
  BOARD_EVENTS,
  type CombatEntryInput,
  type ConditionColorDto,
  type DefineConditionCommandDto,
  type RegroupTargetDto,
} from '@lorkarium/contracts';
import type { BoardCommandResult, BoardCommandSender, BoardScope } from './board-command-sender';
import {
  RealtimeConditionCatalogCommands,
  type ConditionCatalogCommands,
  type ConditionDefinitionEdit,
  type ConditionUsageResult,
} from './condition-catalog-commands';

export type { ConditionDefinitionEdit, ConditionUsageResult } from './condition-catalog-commands';

type Envelope = 'actionId' | 'campaignId' | 'sceneId';
// The description, the stacks and the color are optional on the wire (the contract defaults them
// to '', null and null): the picker creates without them, the settings page sends them.
export type NewConditionDefinition = Omit<
  DefineConditionCommandDto,
  Envelope | 'description' | 'maxStacks' | 'color'
> &
  Readonly<{ description?: string; maxStacks?: number | null; color?: ConditionColorDto | null }>;
/** Where a regroup sends the tokens: into an entry, each into its own, or out of the combat. */
export type RegroupTarget = RegroupTargetDto;

/** The condition and combat commands of an open table (the table's list of conditions included);
 *  each answers with its ack, never throws.
 *
 *  Example: `await commands.regroupTokens(scope, [wolfId], { kind: 'own' })` */
export interface CombatCommands extends ConditionCatalogCommands {
  defineCondition(
    scope: BoardScope,
    definition: NewConditionDefinition,
  ): Promise<BoardCommandResult>;
  applyCondition(
    scope: BoardScope,
    tokenId: string,
    conditionId: string,
    rounds: number,
  ): Promise<BoardCommandResult>;
  applyConditions(
    scope: BoardScope,
    tokenIds: readonly string[],
    conditionId: string,
    rounds: number,
  ): Promise<BoardCommandResult>;
  removeCondition(
    scope: BoardScope,
    tokenId: string,
    activeConditionId: string,
  ): Promise<BoardCommandResult>;
  /** Only the rounds left (0 = no limit); the round it was applied in stays. */
  setConditionRounds(
    scope: BoardScope,
    tokenId: string,
    activeConditionId: string,
    rounds: number,
  ): Promise<BoardCommandResult>;
  /** How many stacks a stacking condition has (1 up to its `maxStacks`); the rounds stay. */
  setConditionStacks(
    scope: BoardScope,
    tokenId: string,
    activeConditionId: string,
    stacks: number,
  ): Promise<BoardCommandResult>;
  startCombat(scope: BoardScope, entries: readonly CombatEntryInput[]): Promise<BoardCommandResult>;
  endCombat(scope: BoardScope): Promise<BoardCommandResult>;
  addCombatants(
    scope: BoardScope,
    entries: readonly CombatEntryInput[],
  ): Promise<BoardCommandResult>;
  removeCombatant(scope: BoardScope, combatantId: string): Promise<BoardCommandResult>;
  moveInTie(
    scope: BoardScope,
    combatantId: string,
    direction: 'up' | 'down',
  ): Promise<BoardCommandResult>;
  setInitiative(
    scope: BoardScope,
    combatantId: string,
    initiative: number | null,
  ): Promise<BoardCommandResult>;
  /** `fromCombatantId`: whose turn the sender saw, so two quick "next" never skip two turns. */
  nextTurn(scope: BoardScope, fromCombatantId: string): Promise<BoardCommandResult>;
  previousTurn(scope: BoardScope, fromCombatantId: string): Promise<BoardCommandResult>;
  /** Moves, splits or takes tokens out of their initiative entries (master). */
  regroupTokens(
    scope: BoardScope,
    tokenIds: readonly string[],
    target: RegroupTarget,
  ): Promise<BoardCommandResult>;
  renameCombatant(
    scope: BoardScope,
    combatantId: string,
    name: string,
  ): Promise<BoardCommandResult>;
}

/** `CombatCommands` over the board command sender; the table commands extend it.
 *
 *  Example: `new RealtimeCombatCommands(sender).nextTurn(scope, fromCombatantId)` */
export class RealtimeCombatCommands implements CombatCommands {
  private readonly catalog: ConditionCatalogCommands;

  constructor(protected readonly sender: BoardCommandSender) {
    this.catalog = new RealtimeConditionCatalogCommands(sender);
  }

  updateConditionDefinition(
    scope: BoardScope,
    edit: ConditionDefinitionEdit,
  ): Promise<BoardCommandResult> {
    return this.catalog.updateConditionDefinition(scope, edit);
  }

  deleteConditionDefinition(scope: BoardScope, conditionId: string): Promise<BoardCommandResult> {
    return this.catalog.deleteConditionDefinition(scope, conditionId);
  }

  restoreDefaultConditions(scope: BoardScope): Promise<BoardCommandResult> {
    return this.catalog.restoreDefaultConditions(scope);
  }

  conditionUsage(scope: BoardScope, conditionId: string): Promise<ConditionUsageResult> {
    return this.catalog.conditionUsage(scope, conditionId);
  }

  defineCondition(
    scope: BoardScope,
    definition: NewConditionDefinition,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.defineCondition, scope, { ...definition });
  }

  applyCondition(
    scope: BoardScope,
    tokenId: string,
    conditionId: string,
    rounds: number,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.applyCondition, scope, { tokenId, conditionId, rounds });
  }

  applyConditions(
    scope: BoardScope,
    tokenIds: readonly string[],
    conditionId: string,
    rounds: number,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.applyConditions, scope, {
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
    return this.send(BOARD_EVENTS.removeCondition, scope, { tokenId, activeConditionId });
  }

  setConditionRounds(
    scope: BoardScope,
    tokenId: string,
    activeConditionId: string,
    rounds: number,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.setConditionRounds, scope, {
      tokenId,
      activeConditionId,
      rounds,
    });
  }

  setConditionStacks(
    scope: BoardScope,
    tokenId: string,
    activeConditionId: string,
    stacks: number,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.setConditionStacks, scope, {
      tokenId,
      activeConditionId,
      stacks,
    });
  }

  startCombat(
    scope: BoardScope,
    entries: readonly CombatEntryInput[],
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.startCombat, scope, { entries: [...entries] });
  }

  endCombat(scope: BoardScope): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.endCombat, scope, {});
  }

  addCombatants(
    scope: BoardScope,
    entries: readonly CombatEntryInput[],
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.addCombatants, scope, { entries: [...entries] });
  }

  removeCombatant(scope: BoardScope, combatantId: string): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.removeCombatant, scope, { combatantId });
  }

  moveInTie(
    scope: BoardScope,
    combatantId: string,
    direction: 'up' | 'down',
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.moveInTie, scope, { combatantId, direction });
  }

  setInitiative(
    scope: BoardScope,
    combatantId: string,
    initiative: number | null,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.setInitiative, scope, { combatantId, initiative });
  }

  nextTurn(scope: BoardScope, fromCombatantId: string): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.nextTurn, scope, { fromCombatantId });
  }

  previousTurn(scope: BoardScope, fromCombatantId: string): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.previousTurn, scope, { fromCombatantId });
  }

  regroupTokens(
    scope: BoardScope,
    tokenIds: readonly string[],
    target: RegroupTarget,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.regroupTokens, scope, { tokenIds: [...tokenIds], target });
  }

  renameCombatant(
    scope: BoardScope,
    combatantId: string,
    name: string,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.renameCombatant, scope, { combatantId, name });
  }

  protected send(event: string, scope: BoardScope, fields: object): Promise<BoardCommandResult> {
    return this.sender.send(event, scope, fields);
  }
}
