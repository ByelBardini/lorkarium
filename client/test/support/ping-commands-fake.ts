import type { BoardScope } from '@/services/board-command-sender';
import type { PingCommands, PingPoint, PingResult } from '@/services/table-pings';

/** The pings the room sent: `sent` keeps each `{ scope, point }`; every one answers `answer`.
 *
 *  Example: `deps.pings.answer = { ok: false, failure: 'rate_limited' }` */
export class PingCommandsFake implements PingCommands {
  readonly sent: Array<Readonly<{ scope: BoardScope; point: PingPoint }>> = [];
  answer: PingResult = { ok: true };

  async sendPing(scope: BoardScope, point: PingPoint): Promise<PingResult> {
    this.sent.push({ scope, point });
    return this.answer;
  }
}
