import { and, asc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { lorkariumOwnerSql } from '../../database/lorkarium-owner-sql';
import type { DatabaseExecutor } from '../../database/transaction';
import { users, type UserPo } from '../auth/users.po';
import { friendships } from './friendships.po';

/** What the friends screen shows of another account (never the e-mail), with the date of the
 *  relation it was listed for: friends since, request sent at, blocked at. `colorChoice` is null
 *  when the color is the automatic one (the mapper draws it with `memberColorOf`). */
export type RelatedAccountRow = Readonly<{
  userId: string;
  username: string;
  name: string;
  colorChoice: UserPo['color'];
  avatarId: string | null;
  plan: UserPo['plan'];
  role: UserPo['role'];
  lorkariumOwner: boolean;
  at: Date;
}>;

/** The `users` columns of a `RelatedAccountRow`, joined by each DAO of the module. */
export const RELATED_ACCOUNT_COLUMNS = {
  userId: users.id,
  username: users.username,
  name: users.name,
  colorChoice: users.color,
  avatarId: users.avatarId,
  plan: users.plan,
  role: users.role,
  lorkariumOwner: lorkariumOwnerSql(users.username),
};

/** The relation of two accounts as `relationBetween` reads it; the counts are the actor's unless
 *  named after the target. */
export type RelationReadingRow = Readonly<{
  friends: boolean;
  actorAsked: boolean;
  targetAsked: boolean;
  actorBlocked: boolean;
  targetBlocked: boolean;
  actorFriendCount: number;
  targetFriendCount: number;
  actorOutgoingCount: number;
  actorBlockCount: number;
}>;

export type CanonicalPair = Readonly<{ userLow: string; userHigh: string }>;

/** The pair in the order the table keeps it.
 *
 *  Example: `canonicalPair(biaId, anaId) // { userLow: <smaller id>, userHigh: <larger id> }` */
export function canonicalPair(oneId: string, otherId: string): CanonicalPair {
  return oneId < otherId
    ? { userLow: oneId, userHigh: otherId }
    : { userLow: otherId, userHigh: oneId };
}

/** The friendships, one row per pair; every query reads the pair in canonical order or both
 *  columns, so the side an id is on never matters to the caller. */
export class FriendshipsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Locks both accounts in id order until the transaction ends, so two writes about the same
   *  pair (two crossed requests) run one after the other; answers the ids that exist. `NO KEY
   *  UPDATE`: rows pointing at the accounts still go in meanwhile. Call it on a DAO built with
   *  the `tx`.
   *
   *  Example: `await new FriendshipsDao(tx).lockPair(anaId, biaId) // [anaId, biaId]` */
  async lockPair(oneId: string, otherId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, [oneId, otherId]))
      .orderBy(asc(users.id))
      .for('no key update');
    return rows.map((row) => row.id);
  }

  /** Everything between `actor` and `target` in one round trip: friendship, requests and blocks
   *  in both directions, and the counts the ceilings are checked against.
   *
   *  Example: `(await new FriendshipsDao(tx).relationBetween(anaId, biaId)).targetAsked` */
  async relationBetween(actorId: string, targetId: string): Promise<RelationReadingRow> {
    const pair = canonicalPair(actorId, targetId);
    const result = await this.db.execute<RelationReadingRow>(sql`
      SELECT
        exists(SELECT 1 FROM friendships WHERE user_low = ${pair.userLow} AND user_high = ${pair.userHigh}) AS "friends",
        exists(SELECT 1 FROM friend_requests WHERE from_user_id = ${actorId} AND to_user_id = ${targetId}) AS "actorAsked",
        exists(SELECT 1 FROM friend_requests WHERE from_user_id = ${targetId} AND to_user_id = ${actorId}) AS "targetAsked",
        exists(SELECT 1 FROM user_blocks WHERE blocker_id = ${actorId} AND blocked_id = ${targetId}) AS "actorBlocked",
        exists(SELECT 1 FROM user_blocks WHERE blocker_id = ${targetId} AND blocked_id = ${actorId}) AS "targetBlocked",
        (SELECT count(*) FROM friendships WHERE user_low = ${actorId} OR user_high = ${actorId})::int AS "actorFriendCount",
        (SELECT count(*) FROM friendships WHERE user_low = ${targetId} OR user_high = ${targetId})::int AS "targetFriendCount",
        (SELECT count(*) FROM friend_requests WHERE from_user_id = ${actorId})::int AS "actorOutgoingCount",
        (SELECT count(*) FROM user_blocks WHERE blocker_id = ${actorId})::int AS "actorBlockCount"`);
    const [row] = result.rows;
    if (!row) throw new Error(`the relation of ${actorId} and ${targetId} read no row`);
    return row;
  }

  /** Throws the `23505` of the primary key when the pair is already friends, and the `23514` of
   *  the canonical `CHECK` for a pair of one id.
   *
   *  Example: `await friendships.insert(biaId, anaId, now)` */
  async insert(oneId: string, otherId: string, at: Date): Promise<void> {
    await this.db.insert(friendships).values({ ...canonicalPair(oneId, otherId), createdAt: at });
  }

  /** Example: `await friendships.exists(anaId, biaId) // true` */
  async exists(oneId: string, otherId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ found: sql<number>`1` })
      .from(friendships)
      .where(pairIs(oneId, otherId))
      .limit(1);
    return row !== undefined;
  }

  /** `false` when they were not friends.
   *
   *  Example: `await friendships.remove(anaId, biaId) // true` */
  async remove(oneId: string, otherId: string): Promise<boolean> {
    const removed = await this.db
      .delete(friendships)
      .where(pairIs(oneId, otherId))
      .returning({ userLow: friendships.userLow });
    return removed.length > 0;
  }

  /** Only the ids of every friend of `userId`, read from the two indexed columns with no join:
   *  whom a presence change or a profile change reaches.
   *
   *  Example: `await friendships.friendIdsOf(anaId) // [biaId]` */
  async friendIdsOf(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userLow: friendships.userLow, userHigh: friendships.userHigh })
      .from(friendships)
      .where(involves(userId));
    return rows.map((row) => (row.userLow === userId ? row.userHigh : row.userLow));
  }

  /** Every friend of `userId`, with since when, by name.
   *
   *  Example: `(await friendships.friendsOf(anaId)).map((friend) => friend.username)` */
  async friendsOf(userId: string): Promise<RelatedAccountRow[]> {
    const otherId = sql`case when ${friendships.userLow} = ${userId} then ${friendships.userHigh} else ${friendships.userLow} end`;
    return this.db
      .select({ ...RELATED_ACCOUNT_COLUMNS, at: friendships.createdAt })
      .from(friendships)
      .innerJoin(users, eq(users.id, otherId))
      .where(involves(userId))
      .orderBy(asc(users.name), asc(users.username));
  }

  /** The one friend `friendId` of `userId`; `undefined` when they are not friends.
   *
   *  Example: `await friendships.friendOf(anaId, biaId) // { username: 'bia', at, … }` */
  async friendOf(userId: string, friendId: string): Promise<RelatedAccountRow | undefined> {
    const [row] = await this.db
      .select({ ...RELATED_ACCOUNT_COLUMNS, at: friendships.createdAt })
      .from(friendships)
      .innerJoin(users, eq(users.id, friendId))
      .where(pairIs(userId, friendId));
    return row;
  }
}

function pairIs(oneId: string, otherId: string): SQL | undefined {
  const pair = canonicalPair(oneId, otherId);
  return and(eq(friendships.userLow, pair.userLow), eq(friendships.userHigh, pair.userHigh));
}

function involves(userId: string): SQL | undefined {
  return or(eq(friendships.userLow, userId), eq(friendships.userHigh, userId));
}
