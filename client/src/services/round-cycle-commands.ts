import { BOARD_EVENTS, type DefineRoundCycleCommandDto } from '@lorkarium/contracts';
import type {
  BoardCommandResult,
  BoardCommandSender,
  BoardScope,
  TableScope,
} from './board-command-sender';

type Envelope = 'actionId' | 'campaignId' | 'sceneId';

/** A whole round cycle as the master writes it (define and update send the same fields). */
export type RoundCycleFields = Omit<DefineRoundCycleCommandDto, Envelope>;

/** The round cycle commands of an open table: the master's list (the table's, so no grid) and
 *  the pick of the next phase in the combat of one grid. Each answers, never throws.
 *
 *  Example: `await commands.chooseNextPhase(scope, moonId, novaId)` */
export interface RoundCycleCommands {
  defineRoundCycle(scope: TableScope, cycle: RoundCycleFields): Promise<BoardCommandResult>;
  updateRoundCycle(
    scope: TableScope,
    cycleId: string,
    cycle: RoundCycleFields,
  ): Promise<BoardCommandResult>;
  deleteRoundCycle(scope: TableScope, cycleId: string): Promise<BoardCommandResult>;
  /** `null` = follow the cycle again. */
  chooseNextPhase(
    scope: BoardScope,
    cycleId: string,
    phaseId: string | null,
  ): Promise<BoardCommandResult>;
}

/** `RoundCycleCommands` over the board command sender.
 *
 *  Example: `new RealtimeRoundCycleCommands(sender).deleteRoundCycle(scope, moonId)` */
export class RealtimeRoundCycleCommands implements RoundCycleCommands {
  constructor(private readonly sender: BoardCommandSender) {}

  defineRoundCycle(scope: TableScope, cycle: RoundCycleFields): Promise<BoardCommandResult> {
    return this.sender.sendToTable(BOARD_EVENTS.defineRoundCycle, scope.campaignId, { ...cycle });
  }

  updateRoundCycle(
    scope: TableScope,
    cycleId: string,
    cycle: RoundCycleFields,
  ): Promise<BoardCommandResult> {
    const fields = { cycleId, ...cycle };
    return this.sender.sendToTable(BOARD_EVENTS.updateRoundCycle, scope.campaignId, fields);
  }

  deleteRoundCycle(scope: TableScope, cycleId: string): Promise<BoardCommandResult> {
    return this.sender.sendToTable(BOARD_EVENTS.deleteRoundCycle, scope.campaignId, { cycleId });
  }

  chooseNextPhase(
    scope: BoardScope,
    cycleId: string,
    phaseId: string | null,
  ): Promise<BoardCommandResult> {
    return this.sender.send(BOARD_EVENTS.chooseNextPhase, scope, { cycleId, phaseId });
  }
}
