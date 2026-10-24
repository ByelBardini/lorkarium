import { eq, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { users, type NewUserPo, type SealedEmail, type UserPo } from './users.po';

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
