import type { BarChangeDto, ConditionToneDto, SceneGridDto } from '@lorkarium/contracts';
import type {
  BoardCommandResult,
  CellTarget,
  NewToken,
  TableBoardCommands,
  TokenEdit,
} from '@/services/table-board-commands';

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

  configureScene(campaignId: string, grid: SceneGridDto): Promise<BoardCommandResult> {
    return this.record('configureScene', campaignId, grid);
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

  dragToken(
    campaignId: string,
    tokenId: string,
    over: CellTarget | null,
  ): Promise<BoardCommandResult> {
    return this.record('dragToken', campaignId, { tokenId, cell: over });
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
    name: string,
    tone: ConditionToneDto,
  ): Promise<BoardCommandResult> {
    return this.record('defineCondition', campaignId, { name, tone });
  }

  applyCondition(
    campaignId: string,
    tokenId: string,
    conditionId: string,
    rounds: number,
  ): Promise<BoardCommandResult> {
    return this.record('applyCondition', campaignId, { tokenId, conditionId, rounds });
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
