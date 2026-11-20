import { and, desc, eq, getTableColumns, isNull, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from '../../database/transaction';
import { mailBroadcastDeliveries } from './mail-broadcast-deliveries.po';
import {
  mailBroadcasts,
  type MailBroadcastPo,
  type NewMailBroadcastPo,
} from './mail-broadcasts.po';

/** A notice with how its deliveries ended so far. */
export type MailBroadcastRow = MailBroadcastPo &
  Readonly<{ sent: number; failed: number; skipped: number }>;

/** What a draft says; rewriting it replaces all of it. */
export type MailBroadcastLetterPo = Pick<
  NewMailBroadcastPo,
  'segment' | 'subject' | 'title' | 'paragraphs' | 'button'
>;

const DELIVERIES = mailBroadcastDeliveries;

// `count(column)` counts the non-null: the deliveries that ended that way.
function endedAs(column: AnyPgColumn): SQL<number> {
  return sql<number>`count(${column})::int`;
}

// The notices are global (a notice of the service, not of one campaign).
const ROW_COLUMNS = {
  ...getTableColumns(mailBroadcasts),
  sent: endedAs(DELIVERIES.sentAt),
  failed: endedAs(DELIVERIES.failedAt),
  skipped: endedAs(DELIVERIES.skippedAt),
};

/** The notices of the backoffice and their drafts.
 *
 *  Example: `await new MailBroadcastsDao(db).list() // the newest first, with the counts` */
export class MailBroadcastsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async insert(values: NewMailBroadcastPo): Promise<MailBroadcastRow> {
    const [row] = await this.db.insert(mailBroadcasts).values(values).returning();
    if (!row) throw new Error(`insert of broadcast "${values.subject}" returned no row`);
    return { ...row, sent: 0, failed: 0, skipped: 0 };
  }

  async list(): Promise<MailBroadcastRow[]> {
    return this.rows().orderBy(desc(mailBroadcasts.createdAt));
  }

  async find(broadcastId: string): Promise<MailBroadcastRow | undefined> {
    const [row] = await this.rows().where(eq(mailBroadcasts.id, broadcastId));
    return row;
  }

  /** The notice under `FOR UPDATE`: two confirmations of the same draft run one after the other. */
  async lock(broadcastId: string): Promise<MailBroadcastPo | undefined> {
    const [row] = await this.db
      .select()
      .from(mailBroadcasts)
      .where(eq(mailBroadcasts.id, broadcastId))
      .for('update');
    return row;
  }

  /** Replaces the text of a draft and forgets its test; a confirmed notice is left untouched. */
  async rewrite(broadcastId: string, letter: MailBroadcastLetterPo): Promise<boolean> {
    const rows = await this.db
      .update(mailBroadcasts)
      .set({ ...letter, testedAt: null })
      .where(and(eq(mailBroadcasts.id, broadcastId), isNull(mailBroadcasts.confirmedAt)))
      .returning({ id: mailBroadcasts.id });
    return rows.length > 0;
  }

  async markTested(broadcastId: string, at: Date): Promise<void> {
    await this.db
      .update(mailBroadcasts)
      .set({ testedAt: at })
      .where(and(eq(mailBroadcasts.id, broadcastId), isNull(mailBroadcasts.confirmedAt)));
  }

  async confirm(broadcastId: string, total: number, at: Date): Promise<void> {
    await this.db
      .update(mailBroadcasts)
      .set({ confirmedAt: at, total })
      .where(eq(mailBroadcasts.id, broadcastId));
  }

  private rows() {
    return this.db
      .select(ROW_COLUMNS)
      .from(mailBroadcasts)
      .leftJoin(DELIVERIES, eq(DELIVERIES.broadcastId, mailBroadcasts.id))
      .groupBy(mailBroadcasts.id)
      .$dynamic();
  }
}
