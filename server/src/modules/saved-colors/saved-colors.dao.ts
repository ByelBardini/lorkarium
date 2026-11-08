import { and, asc, desc, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { users } from '../auth/users.po';
import { accountSavedColors, type SavedColorPo } from './saved-colors.po';

/** The colors one account keeps: every query is keyed by the account, so a color of someone else
 *  is never read nor removed. */
export class SavedColorsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Locks the account until the transaction ends, so two saves of the same account count one
   *  after the other. `NO KEY UPDATE`: the `FOR KEY SHARE` of a row of another table that points
   *  at the account still goes through. Call it on a DAO built with the `tx`.
   *
   *  Example: `await colors.lockOwner(biaId)` */
  async lockOwner(userId: string): Promise<void> {
    await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for('no key update');
  }

  /** The colors of the account, most recent first.
   *
   *  Example: `const rows = await colors.listOf(biaId)` */
  async listOf(userId: string): Promise<SavedColorPo[]> {
    return this.db
      .select()
      .from(accountSavedColors)
      .where(eq(accountSavedColors.userId, userId))
      .orderBy(desc(accountSavedColors.createdAt), asc(accountSavedColors.color));
  }

  /** Keeps the color; `undefined` when the account already had it.
   *
   *  Example: `const row = await colors.insertIfAbsent(biaId, '#336699')` */
  async insertIfAbsent(
    userId: string,
    color: SavedColorPo['color'],
  ): Promise<SavedColorPo | undefined> {
    const [row] = await this.db
      .insert(accountSavedColors)
      .values({ userId, color })
      .onConflictDoNothing()
      .returning();
    return row;
  }

  /** Takes the color off the list; a color the account does not keep changes nothing.
   *
   *  Example: `await colors.remove(biaId, '#336699')` */
  async remove(userId: string, color: SavedColorPo['color']): Promise<void> {
    await this.db
      .delete(accountSavedColors)
      .where(and(eq(accountSavedColors.userId, userId), eq(accountSavedColors.color, color)));
  }
}
