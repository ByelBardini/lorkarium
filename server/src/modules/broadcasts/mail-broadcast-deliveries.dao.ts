import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  notExists,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { users, type UserPo } from '../auth/users.po';
import { mailBroadcastDeliveries } from './mail-broadcast-deliveries.po';
import { mailBroadcasts, type MailBroadcastPo } from './mail-broadcasts.po';

/** A delivery reserved for one sending cycle, with what it needs to go out: the notice's text
 *  and the account (null once deleted). */
export type ClaimedDelivery = Readonly<{
  id: string;
  attempts: number;
  letter: Pick<MailBroadcastPo, 'subject' | 'title' | 'paragraphs' | 'button'>;
  account: Pick<UserPo, 'id' | 'name' | 'username' | 'emailCipher'> | null;
}>;

export type DeliveryFailurePo = Readonly<{
  attempts: number;
  error: string;
  /** Set when the delivery is given up; null = free for the next cycle. */
  failedAt: Date | null;
}>;

const D = mailBroadcastDeliveries;

// Not ended yet: neither sent, given up, nor skipped.
const OPEN: SQL = sql`${D.sentAt} IS NULL AND ${D.failedAt} IS NULL AND ${D.skippedAt} IS NULL`;

/** The queue of the confirmed notices. The reservation is one statement: the batch is picked
 *  with `FOR UPDATE SKIP LOCKED` and stamped with `claimed_until`, so two cycles at the same time
 *  never take the same row, and a cycle that dies frees its rows once the time passes.
 *
 *  Example: `await new MailBroadcastDeliveriesDao(db).claim(now, until, 50)` */
export class MailBroadcastDeliveriesDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async claim(now: Date, until: Date, limit: number): Promise<ClaimedDelivery[]> {
    const free = or(isNull(D.claimedUntil), lte(D.claimedUntil, now));
    const batch = this.db
      .select({ id: D.id })
      .from(D)
      .where(and(OPEN, free))
      .limit(limit)
      .for('update', { skipLocked: true });
    const claimed = await this.db
      .update(D)
      .set({ claimedUntil: until })
      .where(inArray(D.id, batch))
      .returning({ id: D.id });
    return this.claimedRows(claimed.map((row) => row.id));
  }

  async markSent(deliveryId: string, at: Date): Promise<void> {
    await this.end(deliveryId, { sentAt: at });
  }

  async markSkipped(deliveryId: string, at: Date): Promise<void> {
    await this.end(deliveryId, { skippedAt: at });
  }

  /** Records a failed attempt and frees the row (or gives it up, with `failedAt`). */
  async markFailed(deliveryId: string, failure: DeliveryFailurePo): Promise<void> {
    await this.end(deliveryId, { ...failure });
  }

  /** Stamps `finished_at` on every confirmed notice with no open delivery left; returns how many. */
  async finishCompleted(at: Date): Promise<number> {
    const open = this.db
      .select({ id: D.id })
      .from(D)
      .where(and(eq(D.broadcastId, mailBroadcasts.id), OPEN));
    const rows = await this.db
      .update(mailBroadcasts)
      .set({ finishedAt: at })
      .where(
        and(
          isNotNull(mailBroadcasts.confirmedAt),
          isNull(mailBroadcasts.finishedAt),
          notExists(open),
        ),
      )
      .returning({ id: mailBroadcasts.id });
    return rows.length;
  }

  private async end(deliveryId: string, values: Partial<typeof D.$inferInsert>): Promise<void> {
    await this.db
      .update(D)
      .set({ ...values, claimedUntil: null })
      .where(eq(D.id, deliveryId));
  }

  private async claimedRows(ids: readonly string[]): Promise<ClaimedDelivery[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({
        id: D.id,
        attempts: D.attempts,
        letter: {
          subject: mailBroadcasts.subject,
          title: mailBroadcasts.title,
          paragraphs: mailBroadcasts.paragraphs,
          button: mailBroadcasts.button,
        },
        accountId: users.id,
        name: users.name,
        username: users.username,
        emailCipher: users.emailCipher,
      })
      .from(D)
      .innerJoin(mailBroadcasts, eq(mailBroadcasts.id, D.broadcastId))
      .leftJoin(users, eq(users.id, D.userId))
      .where(inArray(D.id, [...ids]));
    return rows.map(({ accountId, name, username, emailCipher, ...rest }) => ({
      ...rest,
      account:
        accountId && name !== null && username !== null && emailCipher !== null
          ? { id: accountId, name, username, emailCipher }
          : null,
    }));
  }
}
