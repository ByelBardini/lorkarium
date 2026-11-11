import type { DiceCommands, DiceRollRequest, DiceRollResult } from '@/services/dice-commands';
import { biaRollAck } from './dice-fixtures';

/** The rolls the room sent: `sent` keeps each `{ campaignId, request }`; every one answers
 *  `answer` (ok with Bia's "Acerto", `biaRollAck`, by default). The result itself is played by the test as a
 *  `diceRolled` update of the table session fake.
 *
 *  Example: `deps.dice.answer = { ok: false, failure: { kind: 'rate_limited', retryAfterSeconds: 1 } }` */
export class DiceCommandsFake implements DiceCommands {
  readonly sent: Array<Readonly<{ campaignId: string; request: DiceRollRequest }>> = [];
  answer: DiceRollResult = biaRollAck();

  async roll(campaignId: string, request: DiceRollRequest): Promise<DiceRollResult> {
    this.sent.push({ campaignId, request });
    return this.answer;
  }
}
