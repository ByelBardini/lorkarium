import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { users } from '../auth/users.po';
import { RELATED_ACCOUNT_COLUMNS, type RelatedAccountRow } from './friendships.dao';
import { userBlocks } from './user-blocks.po';

/** Who blocked whom, one row per direction; the caller asks each direction it cares about. */
export class UserBlocksDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Throws the `23505` of the primary key when `blocker` already blocked `blocked`.
   *
   *  Example: `await blocks.insert(anaId, caioId, now)` */
  async insert(blockerId: string, blockedId: string, at: Date): Promise<void> {
    await this.db.insert(userBlocks).values({ blockerId, blockedId, createdAt: at });
  }

  /** Whether `blocker` blocked `blocked` (one direction only).
   *
   *  Example: `await blocks.exists(campaign.ownerId, userId) // true: keep them out` */
  async exists(blockerId: string, blockedId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ found: sql<number>`1` })
      .from(userBlocks)
      .where(directionIs(blockerId, blockedId))
      .limit(1);
    return row !== undefined;
  }

  /** `false` when there was no such block.
   *
   *  Example: `await blocks.remove(anaId, caioId) // true` */
  async remove(blockerId: string, blockedId: string): Promise<boolean> {
    const removed = await this.db
      .delete(userBlocks)
      .where(directionIs(blockerId, blockedId))
      .returning({ blockedId: userBlocks.blockedId });
    return removed.length > 0;
  }

  /** Everyone `blocker` blocked, the most recent first.
   *
   *  Example: `(await blocks.blockedBy(anaId)).map((blocked) => blocked.username) // ['caio']` */
  async blockedBy(blockerId: string): Promise<RelatedAccountRow[]> {
    return this.db
      .select({ ...RELATED_ACCOUNT_COLUMNS, at: userBlocks.createdAt })
      .from(userBlocks)
      .innerJoin(users, eq(users.id, userBlocks.blockedId))
      .where(eq(userBlocks.blockerId, blockerId))
      .orderBy(desc(userBlocks.createdAt), asc(users.username));
  }

  /** The block of `blocker` on `blocked`, with the profile; `undefined` without it.
   *
   *  Example: `await blocks.blockOf(anaId, caioId) // { username: 'caio', at, … }` */
  async blockOf(blockerId: string, blockedId: string): Promise<RelatedAccountRow | undefined> {
    const [row] = await this.db
      .select({ ...RELATED_ACCOUNT_COLUMNS, at: userBlocks.createdAt })
      .from(userBlocks)
      .innerJoin(users, eq(users.id, userBlocks.blockedId))
      .where(directionIs(blockerId, blockedId));
    return row;
  }
}

function directionIs(blockerId: string, blockedId: string): SQL | undefined {
  return and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId));
}
