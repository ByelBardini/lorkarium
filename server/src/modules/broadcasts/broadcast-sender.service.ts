import type { MailMessage, MailerPort } from '../account-security/mailer.port';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { SchedulerPort } from '../sessions/scheduler.port';
import { failureAfter, redactedFailure } from './broadcast-delivery.bo';
import { broadcastMail } from './broadcast-mail.mapper';
import { letterOf } from './broadcasts.mapper';
import type { ClaimedDelivery, MailBroadcastDeliveriesDao } from './mail-broadcast-deliveries.dao';
import type { SendPacePort } from './send-pace.port';

/** The slice of the pino logger a failed cycle is reported to. */
export type BroadcastSenderLog = Readonly<{ error: (fields: object, message: string) => void }>;

export type BroadcastSenderDeps = Readonly<{
  deliveries: Pick<
    MailBroadcastDeliveriesDao,
    'claim' | 'markSent' | 'markSkipped' | 'markFailed' | 'finishCompleted'
  >;
  cipher: DataCipherPort;
  mailer: MailerPort;
  clock: ClockPort;
  scheduler: SchedulerPort;
  pace: SendPacePort;
  log: BroadcastSenderLog;
  appPublicUrl: string;
  replyTo: string | null;
}>;

// The mail provider caps requests per second (Resend answers 429 above it). One e-mail every
// 600 ms stays under 2 per second, and 50 per cycle, one cycle a minute, is about 2000 an hour,
// far ahead of the 30 days a price notice needs.
export const BROADCAST_SEND_INTERVAL_MS = 60_000;
export const BROADCAST_BATCH_SIZE = 50;
export const BROADCAST_SEND_GAP_MS = 600;
// Longer than a full batch (50 × 0.6 s plus the SMTP round trips): a live cycle never loses its
// rows, and a dead one frees them for the next.
export const BROADCAST_CLAIM_MS = 5 * 60_000;
const SEND_TASK = 'broadcast-sender';

/** Sends the confirmed notices a batch per minute, paced for the provider; survives a restart
 *  because the queue is the table. A failure is tried again next cycle until it gives up.
 *
 *  Example: `sender.start(); …; sender.close()` */
export class BroadcastSenderService {
  private closed = false;

  constructor(private readonly deps: BroadcastSenderDeps) {}

  start(): void {
    this.scheduleCycle();
  }

  /** One batch, then the notices with nothing left are finished; never rejects. */
  async cycle(): Promise<void> {
    try {
      await this.sendBatch();
      await this.deps.deliveries.finishCompleted(this.deps.clock.now());
    } catch (error) {
      this.deps.log.error({ err: error }, 'broadcast sending cycle failed; retrying in a minute');
    }
  }

  close(): void {
    this.closed = true;
    this.deps.scheduler.cancel(SEND_TASK);
  }

  private async sendBatch(): Promise<void> {
    const now = this.deps.clock.now();
    const until = new Date(now.getTime() + BROADCAST_CLAIM_MS);
    const claimed = await this.deps.deliveries.claim(now, until, BROADCAST_BATCH_SIZE);
    for (const [index, delivery] of claimed.entries()) {
      if (this.closed) return;
      if (index > 0) await this.deps.pace.pause(BROADCAST_SEND_GAP_MS);
      await this.deliver(delivery);
    }
  }

  private async deliver(delivery: ClaimedDelivery): Promise<void> {
    const { account } = delivery;
    if (!account) return this.deps.deliveries.markSkipped(delivery.id, this.deps.clock.now());
    let address: string | null = null;
    try {
      address = this.deps.cipher.open('user-email', account.emailCipher, account.id);
      await this.deps.mailer.send(this.messageTo(address, delivery));
      await this.deps.deliveries.markSent(delivery.id, this.deps.clock.now());
    } catch (error) {
      await this.recordFailure(delivery, redactedFailure(error, address));
    }
  }

  private messageTo(to: string, delivery: ClaimedDelivery): MailMessage {
    const { account, letter } = delivery;
    const person = { to, name: account?.name ?? '', username: account?.username ?? '' };
    const { appPublicUrl: publicUrl, replyTo } = this.deps;
    return broadcastMail({ person, letter: letterOf(letter), publicUrl, replyTo });
  }

  private async recordFailure(delivery: ClaimedDelivery, error: string): Promise<void> {
    const { attempts, gaveUp } = failureAfter(delivery.attempts);
    const failedAt = gaveUp ? this.deps.clock.now() : null;
    await this.deps.deliveries.markFailed(delivery.id, { attempts, error, failedAt });
  }

  private scheduleCycle(): void {
    if (this.closed) return;
    this.deps.scheduler.schedule(SEND_TASK, BROADCAST_SEND_INTERVAL_MS, () => {
      void this.cycle().then(() => this.scheduleCycle());
    });
  }
}
