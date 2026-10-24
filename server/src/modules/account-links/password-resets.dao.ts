import { eq, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import {
  passwordResets,
  type NewPasswordResetPo,
  type PasswordResetPo,
} from './password-resets.po';

export class PasswordResetsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Stores the account's link, replacing a previous one: its link stops working. */
  async replace(reset: NewPasswordResetPo): Promise<PasswordResetPo> {
    const { tokenHash, createdAt, expiresAt } = reset;
    const [row] = await this.db
      .insert(passwordResets)
      .values(reset)
      .onConflictDoUpdate({
        target: passwordResets.userId,
        set: { id: sql`gen_random_uuid()`, tokenHash, createdAt, expiresAt },
      })
      .returning();
    if (!row) throw new Error(`upsert into password_resets returned no row for ${reset.userId}`);
    return row;
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetPo | undefined> {
    const [row] = await this.db
      .select()
      .from(passwordResets)
      .where(eq(passwordResets.tokenHash, tokenHash));
    return row;
  }

  /** False when it was already gone (used by a concurrent request). */
  async delete(resetId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(passwordResets)
      .where(eq(passwordResets.id, resetId))
      .returning({ id: passwordResets.id });
    return deleted.length > 0;
  }

  async deleteOfUser(userId: string): Promise<void> {
    await this.db.delete(passwordResets).where(eq(passwordResets.userId, userId));
  }
}
