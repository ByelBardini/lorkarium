import { and, eq, gte } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import {
  accountRecoveryTokens,
  type AccountRecoveryTokenPo,
  type NewAccountRecoveryTokenPo,
} from './account-recovery-tokens.po';

export class AccountRecoveryTokensDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async insert(token: NewAccountRecoveryTokenPo): Promise<void> {
    await this.db.insert(accountRecoveryTokens).values(token);
  }

  async findById(tokenId: string): Promise<AccountRecoveryTokenPo | undefined> {
    const [row] = await this.db
      .select()
      .from(accountRecoveryTokens)
      .where(eq(accountRecoveryTokens.id, tokenId));
    return row;
  }

  /** Deletes one link; false when it was already gone (used by a concurrent request). */
  async deleteById(tokenId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(accountRecoveryTokens)
      .where(eq(accountRecoveryTokens.id, tokenId))
      .returning({ id: accountRecoveryTokens.id });
    return deleted.length > 0;
  }

  /** The links of the account issued at or after `since` die; returns how many there were. */
  async deleteIssuedSince(userId: string, since: Date): Promise<number> {
    const deleted = await this.db
      .delete(accountRecoveryTokens)
      .where(
        and(eq(accountRecoveryTokens.userId, userId), gte(accountRecoveryTokens.createdAt, since)),
      )
      .returning({ id: accountRecoveryTokens.id });
    return deleted.length;
  }
}
