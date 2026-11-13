import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { postgresFailureOf } from '../../src/lib/postgres-error';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { users } from '../../src/modules/auth/users.po';
import { FriendRequestsDao } from '../../src/modules/friends/friend-requests.dao';
import { canonicalPair, FriendshipsDao } from '../../src/modules/friends/friendships.dao';
import { friendships } from '../../src/modules/friends/friendships.po';
import { UserBlocksDao } from '../../src/modules/friends/user-blocks.dao';
import { newUserPo } from '../support/auth-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const NOW = new Date('2026-11-12T20:00:00Z');

async function failureCodeOf(work: Promise<unknown>): Promise<string | undefined> {
  try {
    await work;
  } catch (error) {
    return postgresFailureOf(error)?.code ?? String(error);
  }
  return undefined;
}

describe('the friends DAOs on Postgres', () => {
  let connection: DatabaseConnection;
  let requests: FriendRequestsDao;
  let pairs: FriendshipsDao;
  let blocks: UserBlocksDao;
  let anaId: string;
  let biaId: string;
  let caioId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    requests = new FriendRequestsDao(connection.db);
    pairs = new FriendshipsDao(connection.db);
    blocks = new UserBlocksDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const accounts = new UsersDao(connection.db);
    anaId = (await accounts.insert(newUserPo({ email: 'ana@mesa.com', name: 'Ana' }))).id;
    biaId = (await accounts.insert(newUserPo({ email: 'bia@mesa.com', name: 'Bia' }))).id;
    caioId = (await accounts.insert(newUserPo({ email: 'caio@mesa.com', name: 'Caio' }))).id;
  });

  afterAll(() => connection.close());

  it('a request of Ana to Bia is in the incoming of Bia and the outgoing of Ana, with the profile', async () => {
    await requests.insert(anaId, biaId, NOW);

    expect(await requests.incomingOf(biaId)).toEqual([
      expect.objectContaining({ userId: anaId, username: 'ana', name: 'Ana', at: NOW }),
    ]);
    expect(await requests.outgoingOf(anaId)).toEqual([
      expect.objectContaining({ userId: biaId, username: 'bia', at: NOW }),
    ]);
    expect(await requests.incomingOf(anaId)).toEqual([]);
    expect(await pairs.relationBetween(anaId, biaId)).toMatchObject({
      actorAsked: true,
      targetAsked: false,
      actorOutgoingCount: 1,
    });
  });

  it('the same request twice fails on the primary key (23505)', async () => {
    await requests.insert(anaId, biaId, NOW);

    expect(await failureCodeOf(requests.insert(anaId, biaId, NOW))).toBe('23505');
  });

  it('a request to oneself fails on the CHECK (23514)', async () => {
    expect(await failureCodeOf(requests.insert(anaId, anaId, NOW))).toBe('23514');
  });

  it('deleteBetween removes both directions of the pair and nothing of another pair', async () => {
    await requests.insert(anaId, biaId, NOW);
    await requests.insert(biaId, anaId, NOW);
    await requests.insert(caioId, biaId, NOW);

    expect(await requests.deleteBetween(biaId, anaId)).toBe(2);

    expect(await pairs.relationBetween(anaId, biaId)).toMatchObject({
      actorAsked: false,
      targetAsked: false,
    });
    expect((await requests.incomingOf(biaId)).map((row) => row.userId)).toEqual([caioId]);
  });

  it('the incoming of Bia leaves out a sender Bia blocked, and only that one', async () => {
    await requests.insert(caioId, biaId, NOW);
    await requests.insert(anaId, biaId, NOW);
    await blocks.insert(biaId, caioId, NOW);

    const senders = (await requests.incomingOf(biaId)).map((row) => row.userId);

    expect(senders).toEqual([anaId]);
    expect(await requests.outgoingOf(caioId)).toHaveLength(1);
  });

  it('insertFriendship(bia, ana) keeps the pair in canonical order and both see each other', async () => {
    await pairs.insert(biaId, anaId, NOW);

    const [row] = await connection.db.select().from(friendships);
    expect(row).toMatchObject(canonicalPair(anaId, biaId));
    expect((await pairs.friendsOf(anaId)).map((friend) => friend.userId)).toEqual([biaId]);
    expect((await pairs.friendsOf(biaId)).map((friend) => friend.userId)).toEqual([anaId]);
    expect(await pairs.exists(anaId, biaId)).toBe(true);
    expect(await pairs.friendOf(anaId, biaId)).toMatchObject({ username: 'bia', at: NOW });
    expect(await pairs.relationBetween(biaId, caioId)).toMatchObject({
      actorFriendCount: 1,
      targetFriendCount: 0,
    });
  });

  it('friendIdsOf reads the other id from either column, and nobody else', async () => {
    await pairs.insert(biaId, anaId, NOW);
    await pairs.insert(caioId, biaId, NOW);

    expect((await pairs.friendIdsOf(biaId)).toSorted()).toEqual([anaId, caioId].toSorted());
    expect(await pairs.friendIdsOf(anaId)).toEqual([biaId]);
    expect(await pairs.friendIdsOf(caioId)).toEqual([biaId]);
  });

  it('the same pair written in the other direction fails on the primary key (23505)', async () => {
    await pairs.insert(anaId, biaId, NOW);

    expect(await failureCodeOf(pairs.insert(biaId, anaId, NOW))).toBe('23505');
  });

  it('a friendship with the same id on both sides is refused by the CHECK (23514)', async () => {
    const write = connection.db
      .insert(friendships)
      .values({ userLow: anaId, userHigh: anaId, createdAt: NOW });

    expect(await failureCodeOf(write)).toBe('23514');
  });

  it('a pair written out of order by hand is refused by the CHECK (23514)', async () => {
    const { userLow, userHigh } = canonicalPair(anaId, biaId);
    const write = connection.db
      .insert(friendships)
      .values({ userLow: userHigh, userHigh: userLow, createdAt: NOW });

    expect(await failureCodeOf(write)).toBe('23514');
  });

  it('remove answers whether the pair was friends', async () => {
    await pairs.insert(anaId, biaId, NOW);

    expect(await pairs.remove(biaId, anaId)).toBe(true);
    expect(await pairs.remove(biaId, anaId)).toBe(false);
    expect(await pairs.friendsOf(anaId)).toEqual([]);
  });

  it('a block is one direction: Ana blocked Caio, Caio did not block Ana', async () => {
    await blocks.insert(anaId, caioId, NOW);

    expect(await blocks.exists(anaId, caioId)).toBe(true);
    expect(await blocks.exists(caioId, anaId)).toBe(false);
    expect(await blocks.blockedBy(anaId)).toEqual([
      expect.objectContaining({ userId: caioId, username: 'caio', at: NOW }),
    ]);
    expect(await pairs.relationBetween(caioId, anaId)).toMatchObject({
      actorBlocked: false,
      targetBlocked: true,
      actorBlockCount: 0,
    });
    expect(await failureCodeOf(blocks.insert(anaId, caioId, NOW))).toBe('23505');
    expect(await blocks.remove(anaId, caioId)).toBe(true);
    expect(await blocks.blockOf(anaId, caioId)).toBeUndefined();
  });

  it('deleting an account takes its requests, friendships and blocks with it (cascade)', async () => {
    await requests.insert(anaId, biaId, NOW);
    await requests.insert(biaId, caioId, NOW);
    await pairs.insert(anaId, biaId, NOW);
    await blocks.insert(caioId, biaId, NOW);

    await connection.db.delete(users).where(eq(users.id, biaId));

    const left = await connection.db.execute(sql`
      SELECT (SELECT count(*) FROM friend_requests)::int AS requests,
             (SELECT count(*) FROM friendships)::int AS pairs,
             (SELECT count(*) FROM user_blocks)::int AS blocks`);
    expect(left.rows[0]).toEqual({ requests: 0, pairs: 0, blocks: 0 });
  });

  it('relationBetween of a pair with nothing between them is all false and zero', async () => {
    expect(await pairs.relationBetween(anaId, caioId)).toEqual({
      friends: false,
      actorAsked: false,
      targetAsked: false,
      actorBlocked: false,
      targetBlocked: false,
      actorFriendCount: 0,
      targetFriendCount: 0,
      actorOutgoingCount: 0,
      actorBlockCount: 0,
    });
  });

  it('lockPair answers only the ids that exist, in id order', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';

    const locked = await connection.db.transaction((tx) =>
      new FriendshipsDao(tx).lockPair(biaId, unknown),
    );

    expect(locked).toEqual([biaId]);
  });
});
