/**
 * A `Math.random` stand-in that answers the queued numbers in order (the last one once the queue
 * runs out) and counts every draw.
 * Example: `pickThrow(list, new UnitRandomFake([0.5]).next, null)`
 */
export class UnitRandomFake {
  draws = 0;

  constructor(private readonly values: readonly number[]) {}

  readonly next = (): number => {
    const value = this.values[Math.min(this.draws, this.values.length - 1)] ?? 0;
    this.draws += 1;
    return value;
  };
}
