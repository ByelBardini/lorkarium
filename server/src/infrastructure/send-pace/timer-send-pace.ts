import { setTimeout as sleep } from 'node:timers/promises';
import type { SendPacePort } from '../../modules/broadcasts/send-pace.port';

/** A real pause, by `setTimeout`.
 *
 *  Example: `await new TimerSendPace().pause(600)` */
export class TimerSendPace implements SendPacePort {
  async pause(ms: number): Promise<void> {
    await sleep(ms);
  }
}
