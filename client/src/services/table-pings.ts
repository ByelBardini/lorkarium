import { BOARD_EVENTS, pingAckDto } from '@lorkarium/contracts';
import {
  boardFailureOf,
  type BoardCommandFailure,
  type BoardCommandSender,
  type BoardScope,
} from './board-command-sender';

/** The answer to a ping: nothing is written, so no version comes back. */
export type PingResult =
  Readonly<{ ok: true }> | Readonly<{ ok: false; failure: BoardCommandFailure }>;

/** A point of a grid, in fractional cells. */
export type PingPoint = Readonly<{ x: number; y: number }>;

/** The ping of an open table; answers with its ack, never throws. The others see it by
 *  `board:pinged`; the sender draws its own at once.
 *
 *  Example: `await pings.sendPing(scopeOf(), { x: 5.5, y: 2.2 })` */
export interface PingCommands {
  sendPing(scope: BoardScope, point: PingPoint): Promise<PingResult>;
}

/** `PingCommands` over the board command sender (the same transport as the table session).
 *
 *  Example: `new RealtimePingCommands(new BoardCommandSender(transport, newActionId))` */
export class RealtimePingCommands implements PingCommands {
  constructor(private readonly sender: BoardCommandSender) {}

  async sendPing(scope: BoardScope, { x, y }: PingPoint): Promise<PingResult> {
    const answer = await this.sender.ask(BOARD_EVENTS.ping, scope, { x, y });
    if (!answer.answered) return { ok: false, failure: 'offline' };
    const parsed = pingAckDto.safeParse(answer.ack);
    if (!parsed.success) return { ok: false, failure: 'unexpected' };
    if (parsed.data.ok) return { ok: true };
    return { ok: false, failure: boardFailureOf(parsed.data.error.code) };
  }
}
