import {
  BOARD_EVENTS,
  conditionUsageAckDto,
  type UpdateConditionDefinitionCommandDto,
} from '@lorkarium/contracts';
import {
  boardFailureOf,
  type BoardCommandFailure,
  type BoardCommandResult,
  type BoardCommandSender,
  type TableScope,
} from './board-command-sender';

type Envelope = 'actionId' | 'campaignId' | 'sceneId';

/** A definition as the master saves it in the settings: every field, the id included. */
export type ConditionDefinitionEdit = Omit<UpdateConditionDefinitionCommandDto, Envelope>;

/** How many tokens hold a condition, across every grid and character, or why it was not said. */
export type ConditionUsageResult =
  Readonly<{ ok: true; tokens: number }> | Readonly<{ ok: false; failure: BoardCommandFailure }>;

/** The table's list of conditions, the master's (the settings page): edit, delete, bring the
 *  missing defaults back and count where one is in use. The list is the table's, so no command
 *  names a grid. Each answers, never throws.
 *
 *  Example: `await commands.conditionUsage(scope, blindedId)` */
export interface ConditionCatalogCommands {
  updateConditionDefinition(
    scope: TableScope,
    edit: ConditionDefinitionEdit,
  ): Promise<BoardCommandResult>;
  deleteConditionDefinition(scope: TableScope, conditionId: string): Promise<BoardCommandResult>;
  restoreDefaultConditions(scope: TableScope): Promise<BoardCommandResult>;
  conditionUsage(scope: TableScope, conditionId: string): Promise<ConditionUsageResult>;
}

/** `ConditionCatalogCommands` over the board command sender (the combat commands hold one).
 *
 *  Example: `new RealtimeConditionCatalogCommands(sender).restoreDefaultConditions(scope)` */
export class RealtimeConditionCatalogCommands implements ConditionCatalogCommands {
  constructor(private readonly sender: BoardCommandSender) {}

  updateConditionDefinition(
    scope: TableScope,
    edit: ConditionDefinitionEdit,
  ): Promise<BoardCommandResult> {
    return this.sender.sendToTable(BOARD_EVENTS.updateConditionDefinition, scope.campaignId, {
      ...edit,
    });
  }

  deleteConditionDefinition(scope: TableScope, conditionId: string): Promise<BoardCommandResult> {
    return this.sender.sendToTable(BOARD_EVENTS.deleteConditionDefinition, scope.campaignId, {
      conditionId,
    });
  }

  restoreDefaultConditions(scope: TableScope): Promise<BoardCommandResult> {
    return this.sender.sendToTable(BOARD_EVENTS.restoreDefaultConditions, scope.campaignId, {});
  }

  async conditionUsage(scope: TableScope, conditionId: string): Promise<ConditionUsageResult> {
    const { conditionUsage } = BOARD_EVENTS;
    const answer = await this.sender.askTable(conditionUsage, scope.campaignId, { conditionId });
    if (!answer.answered) return { ok: false, failure: 'offline' };
    const parsed = conditionUsageAckDto.safeParse(answer.ack);
    if (!parsed.success) return { ok: false, failure: 'unexpected' };
    if (!parsed.data.ok) return { ok: false, failure: boardFailureOf(parsed.data.error.code) };
    return { ok: true, tokens: parsed.data.tokens };
  }
}
