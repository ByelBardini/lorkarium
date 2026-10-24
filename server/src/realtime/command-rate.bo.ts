/** Commands a connection may send per second, sustained (spec §8.4). */
export const COMMANDS_PER_SECOND = 20;
/** Commands a connection may send at once (a drag that ends, a few quick clicks). */
export const COMMAND_BURST = 40;

/** A token bucket: `tokens` left, as of `updatedAtMs`. */
export type CommandBucket = Readonly<{ tokens: number; updatedAtMs: number }>;

export type CommandRateOutcome = Readonly<{
  allowed: boolean;
  bucket: CommandBucket;
  /** Whole seconds until the next command would pass; 0 when allowed. */
  retryAfterSeconds: number;
}>;

/** A bucket as a fresh connection gets it: full.
 *
 *  Example: `buckets.set(socket, fullBucket(clock.now().getTime()))` */
export function fullBucket(nowMs: number): CommandBucket {
  return { tokens: COMMAND_BURST, updatedAtMs: nowMs };
}

/** Whether one more command of a connection passes the limit. The time comes in, so the rule
 *  has no clock; the bucket refills at 20 a second up to 40.
 *
 *  Example: `const outcome = new CommandRateBo(bucket).take(clock.now().getTime())` */
export class CommandRateBo {
  constructor(private readonly bucket: CommandBucket) {}

  take(nowMs: number): CommandRateOutcome {
    const elapsedMs = Math.max(0, nowMs - this.bucket.updatedAtMs);
    const refilled = Math.min(
      COMMAND_BURST,
      this.bucket.tokens + (elapsedMs * COMMANDS_PER_SECOND) / 1000,
    );
    if (refilled >= 1) {
      return {
        allowed: true,
        bucket: { tokens: refilled - 1, updatedAtMs: nowMs },
        retryAfterSeconds: 0,
      };
    }
    const waitMs = ((1 - refilled) * 1000) / COMMANDS_PER_SECOND;
    return {
      allowed: false,
      bucket: { tokens: refilled, updatedAtMs: nowMs },
      retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
    };
  }
}
