import {
  SHEET_EVENTS,
  boardCommandAckDto,
  type BarChangeDto,
  type SheetAdjustBarCommandDto,
  type SheetBarCostDto,
  type SheetSpendBarsCommandDto,
} from '@lorkarium/contracts';
import type { RealtimeTransport } from './realtime-transport';

/** `code` is the server's refusal code as it came (the frame gets it back, with the server's
 *  `message` when there was one: INSUFFICIENT_BAR names the bar short), `OFFLINE` when no ack
 *  came in time and `UNEXPECTED` when the ack is outside the DTO. */
export type SheetCommandResult =
  Readonly<{ ok: true; version: number }> | Readonly<{ ok: false; code: string; message?: string }>;

/** The sheet's commands on the table connection; never throws. The bar change itself arrives as
 *  the token's (or the character's) event, like everyone else's.
 *
 *  Example: `await sheetCommands.adjustBar(campaignId, sheetId, barId, { op: 'add', amount: -7 })` */
export interface SheetCommands {
  adjustBar(
    campaignId: string,
    sheetId: string,
    barId: string,
    change: BarChangeDto,
  ): Promise<SheetCommandResult>;
  /** Every cost or none, in one `sheet:spendBars`: a bar short is INSUFFICIENT_BAR.
   *
   *  Example: `await sheetCommands.spendBars(campaignId, sheetId, [{ barId: mpId, amount: 6 }])` */
  spendBars(
    campaignId: string,
    sheetId: string,
    costs: readonly SheetBarCostDto[],
  ): Promise<SheetCommandResult>;
}

// Same patience as every board command.
const SHEET_ACK_TIMEOUT_MS = 5000;

/** `SheetCommands` over the realtime transport: a new action id per command, no token id (the
 *  server finds the sheet's holder).
 *
 *  Example: `new RealtimeSheetCommands(transport, () => crypto.randomUUID())` */
export class RealtimeSheetCommands implements SheetCommands {
  constructor(
    private readonly transport: RealtimeTransport,
    private readonly newActionId: () => string,
  ) {}

  async adjustBar(
    campaignId: string,
    sheetId: string,
    barId: string,
    change: BarChangeDto,
  ): Promise<SheetCommandResult> {
    const command: SheetAdjustBarCommandDto = {
      ...{ actionId: this.newActionId(), campaignId, sheetId },
      ...{ barId, change },
    };
    return this.emit(SHEET_EVENTS.adjustBar, command);
  }

  async spendBars(
    campaignId: string,
    sheetId: string,
    costs: readonly SheetBarCostDto[],
  ): Promise<SheetCommandResult> {
    const command: SheetSpendBarsCommandDto = {
      ...{ actionId: this.newActionId(), campaignId, sheetId },
      costs: [...costs],
    };
    return this.emit(SHEET_EVENTS.spendBars, command);
  }

  private async emit(event: string, command: object): Promise<SheetCommandResult> {
    try {
      return resultOf(await this.transport.emitWithAck(event, command, SHEET_ACK_TIMEOUT_MS));
    } catch {
      return { ok: false, code: 'OFFLINE' };
    }
  }
}

function resultOf(ack: unknown): SheetCommandResult {
  const parsed = boardCommandAckDto.safeParse(ack);
  if (!parsed.success) return { ok: false, code: 'UNEXPECTED' };
  if (parsed.data.ok) return { ok: true, version: parsed.data.version };
  const { code, message } = parsed.data.error;
  return { ok: false, code, message };
}
