import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from '../../database/transaction';
import { users } from '../auth/users.po';
import { userReports } from '../reports/user-reports.po';
import {
  accountSanctions,
  type AccountSanctionPo,
  type NewAccountSanctionPo,
} from './account-sanctions.po';

/** The columns an appeal step writes (the arrival, and with a decision the rest). */
export type AppealColumns = Pick<NewAccountSanctionPo, 'appealReceivedAt'> &
  Partial<
    Pick<
      NewAccountSanctionPo,
      'appealOutcome' | 'appealNote' | 'appealDecidedBy' | 'appealDecidedAt'
    >
  >;

/** A measure with the @ of the admin who applied it and of the one who decided the appeal (null
 *  once that account is gone). */
export type AccountSanctionRow = AccountSanctionPo &
  Readonly<{ issuedByUsername: string | null; decidedByUsername: string | null }>;

const issuer = alias(users, 'sanction_issuer');
const decider = alias(users, 'sanction_decider');

const rowColumns = {
  ...getTableColumns(accountSanctions),
  issuedByUsername: issuer.username,
  decidedByUsername: decider.username,
};

/** Reads and writes `account_sanctions`; every read is of one account or one measure (the
 *  backoffice's), never of a campaign.
 *
 *  Example: `await new AccountSanctionsDao(tx).insert({ userId, kind: 'warning', … })` */
export class AccountSanctionsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async insert(row: NewAccountSanctionPo): Promise<AccountSanctionPo> {
    const [inserted] = await this.db.insert(accountSanctions).values(row).returning();
    if (!inserted) throw new Error(`the measure on account ${row.userId} was not stored`);
    return inserted;
  }

  async findById(sanctionId: string): Promise<AccountSanctionRow | undefined> {
    const [row] = await this.withUsernames().where(eq(accountSanctions.id, sanctionId));
    return row;
  }

  /** The measures of the account, the newest first. */
  async listOf(userId: string): Promise<AccountSanctionRow[]> {
    return this.withUsernames()
      .where(eq(accountSanctions.userId, userId))
      .orderBy(desc(accountSanctions.issuedAt), desc(accountSanctions.id));
  }

  /** The measure under a row lock until the transaction ends: two decisions at once wait. */
  async lockById(sanctionId: string): Promise<AccountSanctionPo | undefined> {
    const [row] = await this.db
      .select()
      .from(accountSanctions)
      .where(eq(accountSanctions.id, sanctionId))
      .for('update');
    return row;
  }

  /** The id of the account's newest suspending measure (a suspension or a ban), or null. */
  async latestSuspendingIdOf(userId: string): Promise<string | null> {
    const suspending = inArray(accountSanctions.kind, ['suspension', 'ban']);
    const [row] = await this.db
      .select({ id: accountSanctions.id })
      .from(accountSanctions)
      .where(and(eq(accountSanctions.userId, userId), suspending))
      .orderBy(desc(accountSanctions.issuedAt), desc(accountSanctions.id))
      .limit(1);
    return row?.id ?? null;
  }

  /** A reverted ban deletes nothing anymore. */
  async cancelDeletion(sanctionId: string): Promise<void> {
    await this.db
      .update(accountSanctions)
      .set({ deletionDueAt: null })
      .where(eq(accountSanctions.id, sanctionId));
  }

  /** "Reativar acesso" lifts every pending deletion of the account with its suspension. */
  async cancelDeletionsOf(userId: string): Promise<void> {
    await this.db
      .update(accountSanctions)
      .set({ deletionDueAt: null })
      .where(and(eq(accountSanctions.userId, userId), isNotNull(accountSanctions.deletionDueAt)));
  }

  async markNotified(sanctionId: string, at: Date): Promise<void> {
    await this.db
      .update(accountSanctions)
      .set({ notifiedAt: at })
      .where(eq(accountSanctions.id, sanctionId));
  }

  /** Up to `limit` measures whose e-mail never left, the oldest first. */
  async unnotified(limit: number): Promise<AccountSanctionPo[]> {
    return this.db
      .select()
      .from(accountSanctions)
      .where(isNull(accountSanctions.notifiedAt))
      .orderBy(asc(accountSanctions.issuedAt))
      .limit(limit);
  }

  /** Up to `limit` bans whose deletion is due at `now`: the person was told (the e-mail left) and
   *  no appeal waits for its decision (none arrived, or it was upheld). */
  async dueBans(now: Date, limit: number): Promise<AccountSanctionPo[]> {
    const noPendingAppeal = or(
      isNull(accountSanctions.appealReceivedAt),
      eq(accountSanctions.appealOutcome, 'upheld'),
    );
    return this.db
      .select()
      .from(accountSanctions)
      .where(
        and(
          lte(accountSanctions.deletionDueAt, now),
          isNotNull(accountSanctions.notifiedAt),
          noPendingAppeal,
        ),
      )
      .orderBy(asc(accountSanctions.deletionDueAt))
      .limit(limit);
  }

  async recordAppeal(sanctionId: string, change: AppealColumns): Promise<void> {
    await this.db.update(accountSanctions).set(change).where(eq(accountSanctions.id, sanctionId));
  }

  /** Whether the report exists and is about `userId` (a measure only cites a report on its target). */
  async reportIsAbout(reportId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: userReports.id })
      .from(userReports)
      .where(and(eq(userReports.id, reportId), eq(userReports.targetId, userId)));
    return row !== undefined;
  }

  private withUsernames() {
    return this.db
      .select(rowColumns)
      .from(accountSanctions)
      .leftJoin(issuer, eq(issuer.id, accountSanctions.issuedBy))
      .leftJoin(decider, eq(decider.id, accountSanctions.appealDecidedBy))
      .$dynamic();
  }
}
