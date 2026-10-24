import { CommandRateBo, fullBucket, type CommandBucket } from './command-rate.bo';
import type { RealtimeSocket } from './realtime-server';

/** The refusal a gateway answers when the bucket is empty (the board's `CommandRateLimitedError`). */
export type RateRefusal = (socketId: string, retryAfterSeconds: number) => Error;

/** One bucket per connection, shared by every gateway (session and board commands drain the
 *  same bucket), kept beside the socket so the plumbing type stays untouched.
 *
 *  Example: `const rate = new CommandRateGuard(clock, refusal); rate.admit(socket) // throws when empty` */
export class CommandRateGuard {
  private readonly buckets = new WeakMap<RealtimeSocket, CommandBucket>();

  constructor(
    private readonly clock: Readonly<{ now: () => Date }>,
    private readonly refusal: RateRefusal,
  ) {}

  admit(socket: RealtimeSocket): void {
    const now = this.clock.now().getTime();
    const outcome = new CommandRateBo(this.buckets.get(socket) ?? fullBucket(now)).take(now);
    this.buckets.set(socket, outcome.bucket);
    if (!outcome.allowed) throw this.refusal(socket.id, outcome.retryAfterSeconds);
  }
}
