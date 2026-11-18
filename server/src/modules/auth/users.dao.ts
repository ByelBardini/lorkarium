import type { UserPlan } from '@lorkarium/contracts';
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { lorkariumOwnerSql } from '../../database/lorkarium-owner-sql';
import type { DatabaseExecutor } from '../../database/transaction';
import { users, type NewUserPo, type SealedEmail, type UserPlanPo, type UserPo } from './users.po';

/** The select of an account's `UserPlanPo`, joined on `users`: every read of a plan for its
 *  limits uses it, so none forgets whether the account is the Dono do Lorkarium.
 *
 *  Example: `db.select({ owner: PLAN_ACCOUNT_COLUMNS }).from(campaigns).innerJoin(users, …)` */
export const PLAN_ACCOUNT_COLUMNS = {
  role: users.role,
  plan: users.plan,
  activePaidPlan: activePaidPlanSql(),
  lorkariumOwner: lorkariumOwnerSql(users.username),
};

/** The paid plan while its end is ahead of the database clock, null after (the end already holds
 *  the grace days): the expiry needs no job on this side.
 *
 *  Example: `db.select({ activePaidPlan: activePaidPlanSql(ownerUsers) }).from(campaigns)…` */
export function activePaidPlanSql(
  account: Readonly<{ paidPlan: AnyPgColumn; paidPlanUntil: AnyPgColumn }> = users,
): SQL<UserPlan | null> {
  return sql<UserPlan | null>`CASE WHEN ${account.paidPlanUntil} > now() THEN ${account.paidPlan} END`;
}

/** The end of the paid plan while it is ahead of the database clock, null after: the date that
 *  goes with `activePaidPlanSql`.
 *
 *  Example: `db.select({ until: activePaidPlanUntilSql() }).from(users)` */
export function activePaidPlanUntilSql(
  account: Readonly<{ paidPlanUntil: AnyPgColumn }> = users,
): SQL<Date | null> {
  const until = sql`CASE WHEN ${account.paidPlanUntil} > now() THEN ${account.paidPlanUntil} END`;
  // The driver hands a raw timestamptz back (drizzle keeps it a string outside a column).
  return until.mapWith((raw: string | Date | null) => (raw === null ? null : new Date(raw)));
}

/** An account still keeping its e-mail in clear (between migrations 0038 and 0039). */
export type PlainEmailRow = Readonly<{ id: string; email: string }>;

export class UsersDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** The account whose blind e-mail index is `emailIndex` (`cipher.index('email-index', email)`). */
  async findByEmailIndex(emailIndex: string): Promise<UserPo | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.emailIndex, emailIndex));
    return row;
  }

  async findById(userId: string): Promise<UserPo | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId));
    return row;
  }

  /** `false` for an unknown or suspended account: the target of a vote or a report.
   *
   *  Example: `await new UsersDao(db).isActive(caioId) // true` */
  async isActive(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.suspendedAt)));
    return row !== undefined;
  }

  /** The account's global role, read under a shared row lock: a role change in progress is waited
   *  for, and one that comes later waits for the caller's transaction.
   *
   *  Example: `await new UsersDao(tx).roleForShare(rootId) // 'admin'` */
  async roleForShare(userId: string): Promise<UserPo['role'] | undefined> {
    const [row] = await this.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .for('share');
    return row?.role;
  }

  /** The account's role, plan and Dono flag, its row locked until the transaction ends: two
   *  writes counted against the same account's plan (its tables as owner) queue here. `NO KEY
   *  UPDATE`, so rows that only point at the account are still inserted meanwhile. Call it on a
   *  DAO built with the `tx`.
   *
   *  Example: `effectiveLimitsOf(await new UsersDao(tx).lockForPlan(ownerId))` */
  async lockForPlan(userId: string): Promise<UserPlanPo | undefined> {
    const [row] = await this.db
      .select(PLAN_ACCOUNT_COLUMNS)
      .from(users)
      .where(eq(users.id, userId))
      .for('no key update');
    return row;
  }

  async findByUsername(username: string): Promise<UserPo | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.username, username));
    return row;
  }

  /** Every @ that starts with `prefix` (`starts_with`, so `_` is no LIKE wildcard). */
  async usernamesStartingWith(prefix: string): Promise<ReadonlySet<string>> {
    const rows = await this.db
      .select({ username: users.username })
      .from(users)
      .where(sql`starts_with(${users.username}, ${prefix})`);
    return new Set(rows.map((row) => row.username));
  }

  /** Inserts an account with the e-mail already sealed: the row never sees it in clear. */
  async insert(user: NewUserPo): Promise<UserPo> {
    const [row] = await this.db.insert(users).values(user).returning();
    if (!row) throw new Error(`insert into users returned no row for username ${user.username}`);
    return row;
  }

  /** Stores a new password hash and when it changed. */
  async updatePassword(userId: string, passwordHash: string, changedAt: Date): Promise<void> {
    await this.db
      .update(users)
      .set({ passwordHash, passwordChangedAt: changedAt })
      .where(eq(users.id, userId));
  }

  /** When the account was last seen (login, or a session touch in its 5-minute step). */
  async touchLastSeen(userId: string, lastSeenAt: Date): Promise<void> {
    await this.db.update(users).set({ lastSeenAt }).where(eq(users.id, userId));
  }

  /** Swaps the sealed e-mail; an index already taken fails with the unique violation (23505). */
  async updateEmail(userId: string, sealed: SealedEmail): Promise<void> {
    await this.db.update(users).set(sealed).where(eq(users.id, userId));
  }

  /** The accounts that still keep the e-mail in clear; none once migration 0039 dropped the column
   *  (raw SQL on purpose: the PO no longer has `email`). */
  async listPlainEmails(): Promise<readonly PlainEmailRow[]> {
    const column = await this.db.execute(sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'email'`);
    if (column.rows.length === 0) return [];
    const plain = await this.db.execute<PlainEmailRow>(sql`
      SELECT id, email FROM users WHERE email_cipher IS NULL AND email IS NOT NULL ORDER BY id`);
    return plain.rows;
  }

  /** Writes the cipher and index of one account and clears its e-mail in clear. */
  async sealEmail(userId: string, sealed: SealedEmail): Promise<void> {
    await this.db.execute(sql`
      UPDATE users SET email_cipher = ${sealed.emailCipher}, email_index = ${sealed.emailIndex},
                       email = NULL
      WHERE id = ${userId}`);
  }
}
