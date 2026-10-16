import type { InteractionClock } from '@/lib/interaction-clock';

type Scheduled = { at: number; run: () => void; cancelled: boolean };

/** A clock the test moves by hand: `advance(ms)` runs, in order, what came due.
 *
 *  Example: `clock.advance(2000) // the bend timer fires` */
export class InteractionClockFake implements InteractionClock {
  private nowMs = 0;
  private readonly scheduled: Scheduled[] = [];

  readonly now = (): number => this.nowMs;

  readonly after = (delayMs: number, run: () => void): (() => void) => {
    const entry: Scheduled = { at: this.nowMs + delayMs, run, cancelled: false };
    this.scheduled.push(entry);
    return () => {
      entry.cancelled = true;
    };
  };

  advance(ms: number): void {
    const until = this.nowMs + ms;
    for (let next = this.nextDue(until); next; next = this.nextDue(until)) {
      this.nowMs = next.at;
      next.cancelled = true;
      next.run();
    }
    this.nowMs = until;
  }

  private nextDue(until: number): Scheduled | undefined {
    const due = this.scheduled.filter(({ at, cancelled }) => !cancelled && at <= until);
    return due.sort((left, right) => left.at - right.at)[0];
  }
}
