import {
  BOARD_EVENTS,
  type CombatEntryInput,
  type DefineConditionCommandDto,
  type RegroupTargetDto,
} from '@lorkarium/contracts';
import type { BoardCommandResult, BoardCommandSender, BoardScope } from './board-command-sender';

type Envelope = 'actionId' | 'campaignId' | 'sceneId';
export type NewConditionDefinition = Omit<DefineConditionCommandDto, Envelope>;
/** Where a regroup sends the tokens: into an entry, each into its own, or out of the combat. */
export type RegroupTarget = RegroupTargetDto;

/** The condition and combat commands of an open table; each answers with its ack, never throws.
 *
 *  Example: `await commands.regroupTokens(scope, [wolfId], { kind: 'own' })` */
export interface CombatCommands {
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
  constructor(protected readonly sender: BoardCommandSender) {}

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
