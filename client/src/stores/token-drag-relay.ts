import type { InteractionClock } from '@/lib/interaction-clock';
import type { TokenDragTarget } from '@/services/table-board-commands';

// 10 previews a second at most: a fast drag stays well under the command rate (§8.4).
export const DRAG_SEND_INTERVAL_MS = 100;

/** Sends one preview of the whole dragged group (one token is a group of one). */
export type SendDrag = (drags: readonly TokenDragTarget[]) => Promise<unknown>;

/** Takes the cells of a drag and sends them to the table: the latest one wins, at most one per
 *  `DRAG_SEND_INTERVAL_MS`, and one at a time, so they reach the server in the order they left.
 *  A group goes out as one preview, never one per token.
 *
 *  Example: `relay.push([{ tokenId, cell: cell(5, 4) }]); … await relay.settle(); commands.moveToken(…)` */
export class TokenDragRelay {
  private waiting: readonly TokenDragTarget[] | null = null;
  private lastSentMs = Number.NEGATIVE_INFINITY;
  private inFlight: Promise<void> | null = null;
  private cancelTimer: (() => void) | null = null;

  constructor(
    private readonly send: SendDrag,
    private readonly clock: InteractionClock,
  ) {}

  push(drags: readonly TokenDragTarget[]): void {
    this.waiting = drags;
    this.pump();
  }

  /** The drag ended with no move: what waits is dropped and `null` goes out for every token,
   *  without waiting. */
  end(tokenIds: readonly string[]): void {
    this.stopTimer();
    this.waiting = tokenIds.map((tokenId) => ({ tokenId, cell: null }));
    this.lastSentMs = Number.NEGATIVE_INFINITY;
    this.pump();
  }

  /** Before the move: drops what waits and answers the preview still on its way (`null` when
   *  none), so the confirmed move is the last word the table hears. */
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
    this.inFlight = this.send(step).then(() => this.onAnswered());
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
