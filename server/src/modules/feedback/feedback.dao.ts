import { asc, count, eq, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { users } from '../auth/users.po';
import {
  feedbackEntries,
  type FeedbackEntryPo,
  type NewFeedbackEntryPo,
} from './feedback-entries.po';

/** The sender as a new entry sees it: the @ to keep and whether the account is suspended. */
export type FeedbackSender = Readonly<{ username: string; suspended: boolean }>;

export type FeedbackPageQuery = Readonly<{ limit: number; offset: number }>;
export type FeedbackPage = Readonly<{ rows: FeedbackEntryPo[]; total: number }>;

/** The entries waiting in the backoffice queue: written by the sender, read by the admin and
 *  deleted when published, archived or with the sender's account.
 *
 *  Example: `await new FeedbackDao(tx).insert(row) // '0b1e…'` */
export class FeedbackDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** The sender, locked until the transaction ends: two entries sent at once count each other.
   *  `no key update` leaves the foreign keys to `users` free.
   *
   *  Example: `await feedback.lockSender(biaId) // { username: 'bia', suspended: false }` */
  async lockSender(userId: string): Promise<FeedbackSender | undefined> {
    const [row] = await this.db
      .select({
        username: users.username,
        suspended: sql<boolean>`${users.suspendedAt} is not null`,
      })
      .from(users)
      .where(eq(users.id, userId))
      .for('no key update');
    return row;
  }

  /** Example: `await feedback.waitingCountOf(biaId) // 3` */
  async waitingCountOf(senderId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(feedbackEntries)
      .where(eq(feedbackEntries.senderId, senderId));
    return row?.total ?? 0;
  }

  async insert(entry: NewFeedbackEntryPo): Promise<string> {
    const [row] = await this.db
      .insert(feedbackEntries)
      .values(entry)
      .returning({ id: feedbackEntries.id });
    if (row) return row.id;
    throw new Error(`feedback of ${entry.senderId} was not inserted: expected one row back`);
  }

  /** One page, oldest first, and the total waiting.
   *
   *  Example: `await feedback.pageOf({ limit: 50, offset: 0 }) // { rows, total }` */
  async pageOf(query: FeedbackPageQuery): Promise<FeedbackPage> {
    const rows = await this.db
      .select()
      .from(feedbackEntries)
      .orderBy(asc(feedbackEntries.createdAt), asc(feedbackEntries.id))
      .limit(query.limit)
      .offset(query.offset);
    const [counted] = await this.db.select({ total: count() }).from(feedbackEntries);
    return { rows, total: counted?.total ?? 0 };
  }

  /** The entry, locked until it is deleted: two admins closing it at once do it once.
   *
   *  Example: `await feedback.lockById(entryId) // undefined once another admin closed it` */
  async lockById(id: string): Promise<FeedbackEntryPo | undefined> {
    const [row] = await this.db
      .select()
      .from(feedbackEntries)
      .where(eq(feedbackEntries.id, id))
      .for('update');
    return row;
  }

  /** Its screenshots go with it (`ON DELETE CASCADE`); their objects must be queued first. */
  async deleteById(id: string): Promise<void> {
    await this.db.delete(feedbackEntries).where(eq(feedbackEntries.id, id));
  }
}
