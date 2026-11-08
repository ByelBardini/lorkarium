/** What to do with one more lost WebGL context: build the board again, or stop and show the
 *  failure (the GPU keeps dropping it). */
export type ContextLossVerdict = 'remount' | 'give-up';

export type ContextLossLimits = Readonly<{ losses: number; windowMs: number }>;

const BOARD_LOSS_LIMITS: ContextLossLimits = { losses: 3, windowMs: 60_000 };

/** How many lost contexts the board takes in how long before giving up (3 in 60 s). The clock
 *  is injected, in ms, and must not go back.
 *
 *  Example: `const budget = new ContextLossBudget(() => performance.now()); if (budget.recordLoss() === 'give-up') showFailure()` */
export class ContextLossBudget {
  private losses: number[] = [];

  constructor(
    private readonly now: () => number,
    private readonly limits: ContextLossLimits = BOARD_LOSS_LIMITS,
  ) {}

  /** Counts a loss now and says whether the board may come back once more. */
  recordLoss(): ContextLossVerdict {
    const at = this.now();
    const last = this.losses.at(-1);
    if (last !== undefined && at < last) {
      throw new Error(
        `context loss at ${at} ms came before the previous one at ${last} ms; expected a clock that never goes back`,
      );
    }
    this.losses = [...this.losses.filter((loss) => at - loss < this.limits.windowMs), at];
    return this.losses.length >= this.limits.losses ? 'give-up' : 'remount';
  }

  /** Forgets every loss: "Recarregar tabuleiro" starts over. */
  reset(): void {
    this.losses = [];
  }
}
