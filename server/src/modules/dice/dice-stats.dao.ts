import { eq, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { users } from '../auth/users.po';

/** The dice counters on `users` (the auth table), added in place: `x = x + n` keeps two rolls
 *  at once from losing one (no read-then-write). It fulfills `DiceStatsPort` by its shape.
 *
 *  Example: `await new DiceStatsDao(db).addRoll(userId, 1)` */
export class DiceStatsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async addRoll(userId: string, natural20s: number): Promise<void> {
    await this.db
      .update(users)
      .set({
        rollsCount: sql`${users.rollsCount} + 1`,
        natural20Count: sql`${users.natural20Count} + ${natural20s}`,
      })
      .where(eq(users.id, userId));
  }
}
