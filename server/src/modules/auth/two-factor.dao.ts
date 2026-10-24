import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { Database } from '../../database/database';
import { userTwoFactor, type UserTwoFactorPo } from './two-factor.po';

export class TwoFactorDao {
  constructor(private readonly db: Database) {}

  async findOf(userId: string): Promise<UserTwoFactorPo | undefined> {
    const [row] = await this.db
      .select()
      .from(userTwoFactor)
      .where(eq(userTwoFactor.userId, userId));
    return row;
  }

  /** Stores a new pending secret, replacing a setup never confirmed (the row starts over). */
  async savePending(userId: string, secretCipher: string): Promise<void> {
    const pending = { secretCipher, enabledAt: null, lastStep: null };
    await this.db
      .insert(userTwoFactor)
      .values({ userId, ...pending })
      .onConflictDoUpdate({ target: userTwoFactor.userId, set: pending });
  }

  async enable(userId: string, enabledAt: Date, lastStep: number): Promise<void> {
    await this.db
      .update(userTwoFactor)
      .set({ enabledAt, lastStep })
      .where(eq(userTwoFactor.userId, userId));
  }

  /** Records `step` as the last accepted one only if it is newer: `false` = a concurrent request
   *  used this step (or a later one) first, so this use is a replay. */
  async recordStep(userId: string, step: number): Promise<boolean> {
    const newer = or(isNull(userTwoFactor.lastStep), lt(userTwoFactor.lastStep, step));
    const updated = await this.db
      .update(userTwoFactor)
      .set({ lastStep: step })
      .where(and(eq(userTwoFactor.userId, userId), newer))
      .returning({ userId: userTwoFactor.userId });
    return updated.length > 0;
  }

  async delete(userId: string): Promise<void> {
    await this.db.delete(userTwoFactor).where(eq(userTwoFactor.userId, userId));
  }
}
