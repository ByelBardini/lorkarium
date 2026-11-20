import { and, eq, gt } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { bannedEmailIndexes } from './banned-email-indexes.po';

/** The blind indexes of the e-mails of accounts deleted for a violation (global, of no campaign).
 *
 *  Example: `await new BannedEmailIndexesDao(tx).ban(row.emailIndex, now)` */
export class BannedEmailIndexesDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** A second ban of the same e-mail restarts its 5 years. */
  async ban(emailIndex: string, bannedAt: Date): Promise<void> {
    await this.db
      .insert(bannedEmailIndexes)
      .values({ emailIndex, bannedAt })
      .onConflictDoUpdate({ target: bannedEmailIndexes.emailIndex, set: { bannedAt } });
  }

  /** Whether the e-mail was banned after `since` (an older ban has lapsed). */
  async isBannedSince(emailIndex: string, since: Date): Promise<boolean> {
    const [row] = await this.db
      .select({ emailIndex: bannedEmailIndexes.emailIndex })
      .from(bannedEmailIndexes)
      .where(
        and(eq(bannedEmailIndexes.emailIndex, emailIndex), gt(bannedEmailIndexes.bannedAt, since)),
      );
    return row !== undefined;
  }
}
