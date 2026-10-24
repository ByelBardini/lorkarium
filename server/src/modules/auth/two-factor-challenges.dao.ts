import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../database/database';
import {
  twoFactorChallenges,
  type NewTwoFactorChallengePo,
  type TwoFactorChallengePo,
} from './two-factor-challenges.po';

export class TwoFactorChallengesDao {
  constructor(private readonly db: Database) {}

  async insert(challenge: NewTwoFactorChallengePo): Promise<void> {
    await this.db.insert(twoFactorChallenges).values(challenge);
  }

  async findById(challengeId: string): Promise<TwoFactorChallengePo | undefined> {
    const [row] = await this.db
      .select()
      .from(twoFactorChallenges)
      .where(eq(twoFactorChallenges.id, challengeId));
    return row;
  }

  /** Counts one more wrong code in the database (no lost update between two requests); returns
   *  the total, or 0 when the challenge is gone. */
  async recordFailure(challengeId: string): Promise<number> {
    const [row] = await this.db
      .update(twoFactorChallenges)
      .set({ failures: sql`${twoFactorChallenges.failures} + 1` })
      .where(eq(twoFactorChallenges.id, challengeId))
      .returning({ failures: twoFactorChallenges.failures });
    return row?.failures ?? 0;
  }

  async delete(challengeId: string): Promise<void> {
    await this.db.delete(twoFactorChallenges).where(eq(twoFactorChallenges.id, challengeId));
  }
}
