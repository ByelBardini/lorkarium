import type { Cell } from '@lorkarium/game-core';
import type { InteractionClock } from '@/lib/interaction-clock';

// 10 previews a second at most: a fast drag stays well under the command rate (§8.4).
export const DRAG_SEND_INTERVAL_MS = 100;

export type SendDrag = (tokenId: string, over: Cell | null) => Promise<unknown>;

type DragStep = Readonly<{ tokenId: string; over: Cell | null }>;

/** Takes the cells of a drag and sends them to the table: the latest one wins, at most one per
 *  `DRAG_SEND_INTERVAL_MS`, and one at a time, so they reach the server in the order they left.
 *
 *  Example: `relay.push(tokenId, cell(5, 4)); … await relay.settle(); commands.moveToken(…)` */
export class TokenDragRelay {
  private waiting: DragStep | null = null;
  private lastSentMs = Number.NEGATIVE_INFINITY;
  private inFlight: Promise<void> | null = null;
  private cancelTimer: (() => void) | null = null;

  constructor(
    private readonly send: SendDrag,
    private readonly clock: InteractionClock,
  ) {}

  push(tokenId: string, over: Cell): void {
    this.waiting = { tokenId, over };
    this.pump();
  }

  /** The drag ended with no move: what waits is dropped and `null` goes out without waiting. */
  end(tokenId: string): void {
    this.stopTimer();
    this.waiting = { tokenId, over: null };
    this.lastSentMs = Number.NEGATIVE_INFINITY;
    this.pump();
  }

  /** Before the move: drops what waits and answers the preview still on its way (`null` when
   *  none), so the confirmed `token:moved` is the last word the table hears. */
  settle(): Promise<void> | null {
    this.stopTimer();
    this.waiting = null;
    return this.inFlight;
  }

  private pump(): void {
    if (this.inFlight || this.cancelTimer || !this.waiting) return;
    const wait = this.lastSentMs + DRAG_SEND_INTERVAL_MS - this.clock.now();
    if (wait > 0) return void (this.cancelTimer = this.clock.after(wait, () => this.onTimer()));
    const step = this.waiting;
    this.waiting = null;
    this.lastSentMs = this.clock.now();
    this.inFlight = this.send(step.tokenId, step.over).then(() => this.onAnswered());
  }

  private onTimer(): void {
    this.cancelTimer = null;
    this.pump();
  }

  private onAnswered(): void {
    this.inFlight = null;
    this.pump();
  }

  private stopTimer(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
  }
}
