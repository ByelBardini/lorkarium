import { and, asc, eq, notInArray, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { mainTokens, type MainTokenPo } from './main-tokens.po';

/** Who chose which token as main on one scene. */
export type MainTokenChoicePo = Pick<MainTokenPo, 'userId' | 'tokenId'>;

/** The main token of each person, one per scene; a deleted token takes its choices along (cascade). */
export class MainTokensDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async listOfScene(sceneId: string): Promise<MainTokenChoicePo[]> {
    return this.db
      .select({ userId: mainTokens.userId, tokenId: mainTokens.tokenId })
      .from(mainTokens)
      .where(eq(mainTokens.sceneId, sceneId))
      .orderBy(asc(mainTokens.chosenAt), asc(mainTokens.userId));
  }

  /** A second choice on the same scene replaces the first in place. */
  async choose(sceneId: string, userId: string, tokenId: string): Promise<void> {
    await this.db
      .insert(mainTokens)
      .values({ sceneId, userId, tokenId })
      .onConflictDoUpdate({
        target: [mainTokens.sceneId, mainTokens.userId],
        set: { tokenId, chosenAt: sql`now()` },
      });
  }

  /** Deletes the choices of `tokenId` made by anyone not in `keptUserIds` (who left its control). */
  async dropLostControl(tokenId: string, keptUserIds: readonly string[]): Promise<void> {
    const ofToken = eq(mainTokens.tokenId, tokenId);
    const lost =
      keptUserIds.length === 0
        ? ofToken
        : and(ofToken, notInArray(mainTokens.userId, [...keptUserIds]));
    await this.db.delete(mainTokens).where(lost);
  }
}
