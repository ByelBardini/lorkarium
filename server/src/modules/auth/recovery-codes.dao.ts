import { and, count, eq, isNull } from 'drizzle-orm';
import type { Database } from '../../database/database';
import { recoveryCodes, type RecoveryCodePo } from './two-factor.po';

export class RecoveryCodesDao {
  constructor(private readonly db: Database) {}

  async findOf(userId: string, codeIndex: string): Promise<RecoveryCodePo | undefined> {
    const [row] = await this.db
      .select()
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, userId), eq(recoveryCodes.codeIndex, codeIndex)));
    return row;
  }

  /** Marks the code used only if it was not: `false` = a concurrent request used it first. */
  async use(userId: string, codeIndex: string, usedAt: Date): Promise<boolean> {
    const unused = and(
      eq(recoveryCodes.userId, userId),
      eq(recoveryCodes.codeIndex, codeIndex),
      isNull(recoveryCodes.usedAt),
    );
    const updated = await this.db
      .update(recoveryCodes)
      .set({ usedAt })
      .where(unused)
      .returning({ id: recoveryCodes.id });
    return updated.length > 0;
  }

  /** Replaces every code of the user by `codeIndexes`: the previous ones stop working. */
  async replace(userId: string, codeIndexes: readonly string[]): Promise<void> {
    await this.db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
    if (codeIndexes.length === 0) return;
    await this.db
      .insert(recoveryCodes)
      .values(codeIndexes.map((codeIndex) => ({ userId, codeIndex })));
  }

  async countUnused(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ unused: count() })
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)));
    return row?.unused ?? 0;
  }
}
