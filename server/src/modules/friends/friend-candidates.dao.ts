import { and, asc, isNull, like, ne, notExists, or, sql, type SQLWrapper } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { users } from '../auth/users.po';
import { friendRequests } from './friend-requests.po';
import { RELATED_ACCOUNT_COLUMNS, type RelatedAccountRow } from './friendships.dao';
import { friendships } from './friendships.po';
import { userBlocks } from './user-blocks.po';

/** An account the search lists: the profile, without the date of a relation it has none of. */
export type FriendCandidateRow = Omit<RelatedAccountRow, 'at'>;

/** Accounts `userId` could still send a request to, found by the start of the @. Someone who
 *  blocked `userId` stays listed: hiding them would reveal the block (the request is silent). */
export class FriendCandidatesDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** At most `limit` accounts whose @ starts with `prefix`, ordered by @; never `userId`, a
   *  suspended account, a friend, a pending request either way, or someone `userId` blocked.
   *
   *  Example: `(await candidates.search(anaId, 'bi', 10)).map((row) => row.username) // ['bia']` */
  async search(userId: string, prefix: string, limit: number): Promise<FriendCandidateRow[]> {
    return this.db
      .select(RELATED_ACCOUNT_COLUMNS)
      .from(users)
      .where(
        and(
          like(users.username, `${escapeLike(prefix)}%`),
          ne(users.id, userId),
          isNull(users.suspendedAt),
          notExists(this.friendshipWith(userId)),
          notExists(this.requestWith(userId)),
          notExists(this.blockedBy(userId)),
        ),
      )
      .orderBy(asc(users.username))
      .limit(limit);
  }

  private friendshipWith(userId: string): SQLWrapper {
    return this.db
      .select({ found: sql`1` })
      .from(friendships)
      .where(
        or(
          and(sql`${friendships.userLow} = ${userId}`, sql`${friendships.userHigh} = ${users.id}`),
          and(sql`${friendships.userHigh} = ${userId}`, sql`${friendships.userLow} = ${users.id}`),
        ),
      );
  }

  private requestWith(userId: string): SQLWrapper {
    return this.db
      .select({ found: sql`1` })
      .from(friendRequests)
      .where(
        or(
          and(
            sql`${friendRequests.fromUserId} = ${userId}`,
            sql`${friendRequests.toUserId} = ${users.id}`,
          ),
          and(
            sql`${friendRequests.toUserId} = ${userId}`,
            sql`${friendRequests.fromUserId} = ${users.id}`,
          ),
        ),
      );
  }

  private blockedBy(userId: string): SQLWrapper {
    return this.db
      .select({ found: sql`1` })
      .from(userBlocks)
      .where(
        and(sql`${userBlocks.blockerId} = ${userId}`, sql`${userBlocks.blockedId} = ${users.id}`),
      );
  }
}

// `_` is a LIKE wildcard and a legal @ character: "a_b" must not match "axb".
function escapeLike(prefix: string): string {
  return prefix.replace(/[\\%_]/g, (character) => `\\${character}`);
}
