/** The pause before the boot "who am I" is asked again, moved by hand: each `wait` is recorded
 *  and stays pending until `release()`; `RetryWaitFake.instant()` ends each pause at once. */
export class RetryWaitFake {
  readonly waited: number[] = [];
  private readonly wakes: Array<() => void> = [];

  private constructor(private readonly endsAtOnce: boolean) {}

  /** Every pause pending until `release()`. */
  static held(): RetryWaitFake {
    return new RetryWaitFake(false);
  }

  /** Every pause over at once (still recorded), for loops no test drives. */
  static instant(): RetryWaitFake {
    return new RetryWaitFake(true);
  }

  readonly wait = (ms: number): Promise<void> => {
    this.waited.push(ms);
    if (this.endsAtOnce) return Promise.resolve();
    return new Promise((wake) => this.wakes.push(wake));
  };

  /** Ends every pause still pending. */
  release(): void {
    for (const wake of this.wakes.splice(0)) wake();
  }
}
