import { and, asc, eq, notExists, or, sql, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { users } from '../auth/users.po';
import { friendRequests } from './friend-requests.po';
import { RELATED_ACCOUNT_COLUMNS, type RelatedAccountRow } from './friendships.dao';
import { userBlocks } from './user-blocks.po';

/** The pending requests, one row per direction (`from` asked `to`). */
export class FriendRequestsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Throws the `23505` of the primary key when `from` already asked `to`.
   *
   *  Example: `await requests.insert(anaId, biaId, now)` */
  async insert(fromUserId: string, toUserId: string, at: Date): Promise<void> {
    await this.db.insert(friendRequests).values({ fromUserId, toUserId, createdAt: at });
  }

  /** Deletes the requests of the pair in both directions; answers how many went.
   *
   *  Example: `await requests.deleteBetween(anaId, biaId) // 1` */
  async deleteBetween(oneId: string, otherId: string): Promise<number> {
    const removed = await this.db
      .delete(friendRequests)
      .where(or(directionIs(oneId, otherId), directionIs(otherId, oneId)))
      .returning({ fromUserId: friendRequests.fromUserId });
    return removed.length;
  }

  /** Who asked `userId`, oldest first; a sender `userId` blocked never shows (the request was
   *  kept so the sender does not learn of the block).
   *
   *  Example: `(await requests.incomingOf(biaId)).map((sender) => sender.username) // ['ana']` */
  async incomingOf(userId: string): Promise<RelatedAccountRow[]> {
    const blockedSender = this.db
      .select({ found: sql<number>`1` })
      .from(userBlocks)
      .where(
        and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, friendRequests.fromUserId)),
      );
    return this.db
      .select({ ...RELATED_ACCOUNT_COLUMNS, at: friendRequests.createdAt })
      .from(friendRequests)
      .innerJoin(users, eq(users.id, friendRequests.fromUserId))
      .where(and(eq(friendRequests.toUserId, userId), notExists(blockedSender)))
      .orderBy(asc(friendRequests.createdAt), asc(users.username));
  }

  /** Whom `userId` asked, oldest first (a request to someone who blocked them included).
   *
   *  Example: `(await requests.outgoingOf(anaId)).map((target) => target.username) // ['bia']` */
  async outgoingOf(userId: string): Promise<RelatedAccountRow[]> {
    return this.db
      .select({ ...RELATED_ACCOUNT_COLUMNS, at: friendRequests.createdAt })
      .from(friendRequests)
      .innerJoin(users, eq(users.id, friendRequests.toUserId))
      .where(eq(friendRequests.fromUserId, userId))
      .orderBy(asc(friendRequests.createdAt), asc(users.username));
  }
}

function directionIs(fromUserId: string, toUserId: string): SQL | undefined {
  return and(eq(friendRequests.fromUserId, fromUserId), eq(friendRequests.toUserId, toUserId));
}
