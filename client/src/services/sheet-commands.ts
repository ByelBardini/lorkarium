import {
  SHEET_EVENTS,
  boardCommandAckDto,
  type BarChangeDto,
  type SheetAdjustBarCommandDto,
} from '@lorkarium/contracts';
import type { RealtimeTransport } from './realtime-transport';

/** `code` is the server's refusal code as it came (the frame gets it back), `OFFLINE` when no ack
 *  came in time and `UNEXPECTED` when the ack is outside the DTO. */
export type SheetCommandResult =
  Readonly<{ ok: true; version: number }> | Readonly<{ ok: false; code: string }>;

/** The sheet's commands on the table connection; never throws. The bar change itself arrives as
 *  the token's event, like everyone else's.
 *
 *  Example: `await sheetCommands.adjustBar(campaignId, sheetId, barId, { op: 'add', amount: -7 })` */
export interface SheetCommands {
  adjustBar(
    campaignId: string,
    sheetId: string,
    barId: string,
    change: BarChangeDto,
  ): Promise<SheetCommandResult>;
}

// Same patience as every board command.
const SHEET_ACK_TIMEOUT_MS = 5000;

/** `SheetCommands` over the realtime transport: a new action id per command, no token id (the
 *  server finds the sheet's token).
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
    try {
      const ack = await this.transport.emitWithAck(
        SHEET_EVENTS.adjustBar,
        command,
        SHEET_ACK_TIMEOUT_MS,
      );
      return resultOf(ack);
    } catch {
      return { ok: false, code: 'OFFLINE' };
    }
  }
}

function resultOf(ack: unknown): SheetCommandResult {
  const parsed = boardCommandAckDto.safeParse(ack);
  if (!parsed.success) return { ok: false, code: 'UNEXPECTED' };
  if (parsed.data.ok) return { ok: true, version: parsed.data.version };
  return { ok: false, code: parsed.data.error.code };
}
