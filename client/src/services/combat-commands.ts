import {
  BOARD_EVENTS,
  type CombatEntryInput,
  type DefineConditionCommandDto,
  type RegroupTargetDto,
} from '@lorkarium/contracts';
import type { BoardCommandResult, BoardCommandSender } from './board-command-sender';

type Envelope = 'actionId' | 'campaignId';
export type NewConditionDefinition = Omit<DefineConditionCommandDto, Envelope>;
/** Where a regroup sends the tokens: into an entry, each into its own, or out of the combat. */
export type RegroupTarget = RegroupTargetDto;

/** The condition and combat commands of an open table; each answers with its ack, never throws.
 *
 *  Example: `await commands.regroupTokens(campaignId, [wolfId], { kind: 'own' })` */
export interface CombatCommands {
  defineCondition(
    campaignId: string,
    definition: NewConditionDefinition,
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
  /** Only the rounds left (0 = no limit); the round it was applied in stays. */
  setConditionRounds(
    campaignId: string,
    tokenId: string,
    activeConditionId: string,
    rounds: number,
  ): Promise<BoardCommandResult>;
  startCombat(
    campaignId: string,
    entries: readonly CombatEntryInput[],
  ): Promise<BoardCommandResult>;
  endCombat(campaignId: string): Promise<BoardCommandResult>;
  addCombatants(
    campaignId: string,
    entries: readonly CombatEntryInput[],
  ): Promise<BoardCommandResult>;
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
  /** Moves, splits or takes tokens out of their initiative entries (master). */
  regroupTokens(
    campaignId: string,
    tokenIds: readonly string[],
    target: RegroupTarget,
  ): Promise<BoardCommandResult>;
  renameCombatant(
    campaignId: string,
    combatantId: string,
    name: string,
  ): Promise<BoardCommandResult>;
}

/** `CombatCommands` over the board command sender; the table commands extend it.
 *
 *  Example: `new RealtimeCombatCommands(sender).nextTurn(campaignId, fromCombatantId)` */
export class RealtimeCombatCommands implements CombatCommands {
  constructor(protected readonly sender: BoardCommandSender) {}

  defineCondition(
    campaignId: string,
    definition: NewConditionDefinition,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.defineCondition, campaignId, { ...definition });
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

  setConditionRounds(
    campaignId: string,
    tokenId: string,
    activeConditionId: string,
    rounds: number,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.setConditionRounds, campaignId, {
      tokenId,
      activeConditionId,
      rounds,
    });
  }

  startCombat(
    campaignId: string,
    entries: readonly CombatEntryInput[],
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.startCombat, campaignId, { entries: [...entries] });
  }

  endCombat(campaignId: string): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.endCombat, campaignId, {});
  }

  addCombatants(
    campaignId: string,
    entries: readonly CombatEntryInput[],
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.addCombatants, campaignId, { entries: [...entries] });
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

  regroupTokens(
    campaignId: string,
    tokenIds: readonly string[],
    target: RegroupTarget,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.regroupTokens, campaignId, { tokenIds: [...tokenIds], target });
  }

  renameCombatant(
    campaignId: string,
    combatantId: string,
    name: string,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.renameCombatant, campaignId, { combatantId, name });
  }

  protected send(event: string, campaignId: string, fields: object): Promise<BoardCommandResult> {
    return this.sender.send(event, campaignId, fields);
  }
}
