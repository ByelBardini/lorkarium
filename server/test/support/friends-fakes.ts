import type { UserPo } from '../../src/modules/auth/users.po';
import type {
  MemberRemoval,
  MemberRemovedPort,
} from '../../src/modules/campaigns/member-removed.port';
import type {
  FriendsChange,
  FriendsChangedPort,
} from '../../src/modules/friends/friends-changed.port';
import type {
  FriendsReadDaos,
  FriendsTransactionRunner,
  FriendsWriteDaos,
} from '../../src/modules/friends/friends.service';
import {
  canonicalPair,
  type RelatedAccountRow,
  type RelationReadingRow,
} from '../../src/modules/friends/friendships.dao';
import type { UserBlocksDao } from '../../src/modules/friends/user-blocks.dao';

type Pair = Readonly<{ fromId: string; toId: string; at: Date }>;

/** The accounts the fakes know, by id: what a joined profile reads. */
export type KnownAccount = Pick<UserPo, 'id' | 'username' | 'name'>;

/** Requests, friendships, blocks and seats in memory, behind the DAOs the friends service uses;
 *  `locks` keeps every `lockPair` call, in order. */
export class FriendsStoreFake {
  readonly requests: Pair[] = [];
  readonly friendships: Pair[] = [];
  readonly blocks: Pair[] = [];
  /** Tables owned by `ownerId` that `userId` sits at. */
  readonly seats: { campaignId: string; ownerId: string; userId: string }[] = [];
  readonly locks: string[][] = [];

  constructor(private readonly accounts: readonly KnownAccount[]) {}

  readonly daos: FriendsWriteDaos & FriendsReadDaos = {
    friendships: {
      lockPair: async (oneId, otherId) => this.lockPair(oneId, otherId),
      relationBetween: async (actorId, targetId) => this.relationBetween(actorId, targetId),
      insert: async (oneId, otherId, at) => this.insertFriendship(oneId, otherId, at),
      remove: async (oneId, otherId) => this.removeFrom(this.friendships, oneId, otherId, true),
      friendOf: async (userId, friendId) => this.friendOf(userId, friendId),
      friendsOf: async (userId) => this.friendsOf(userId),
    },
    requests: {
      insert: async (fromId, toId, at) => void this.requests.push({ fromId, toId, at }),
      deleteBetween: async (oneId, otherId) => this.deleteRequests(oneId, otherId),
      incomingOf: async (userId) =>
        this.rowsOf(
          this.requests,
          (pair) => pair.toId === userId && !this.blocked(userId, pair.fromId),
          'fromId',
        ),
      outgoingOf: async (userId) =>
        this.rowsOf(this.requests, (pair) => pair.fromId === userId, 'toId'),
    },
    blocks: {
      insert: async (blockerId, blockedId, at) =>
        void this.blocks.push({ fromId: blockerId, toId: blockedId, at }),
      remove: async (blockerId, blockedId) =>
        this.removeFrom(this.blocks, blockerId, blockedId, false),
      blockOf: async (blockerId, blockedId) => this.blockOf(blockerId, blockedId),
      blockedBy: async (blockerId) =>
        this.rowsOf(this.blocks, (pair) => pair.fromId === blockerId, 'toId'),
    },
    seats: { removeFromOwnedBy: async (ownerId, userId) => this.removeSeats(ownerId, userId) },
  };

  /** Runs the work on the same in-memory DAOs; a throw leaves the arrays as the work left them
   *  (the service never writes before the BO decides). */
  readonly run: FriendsTransactionRunner = async (work) => work(this.daos);

  private blocked(blockerId: string, blockedId: string): boolean {
    return this.blocks.some((pair) => pair.fromId === blockerId && pair.toId === blockedId);
  }

  private lockPair(oneId: string, otherId: string): string[] {
    const ids = [oneId, otherId].filter((id) => this.accounts.some((account) => account.id === id));
    const locked = [...new Set(ids)].sort();
    this.locks.push(locked);
    return locked;
  }

  private relationBetween(actorId: string, targetId: string): RelationReadingRow {
    const has = (pairs: Pair[], from: string, to: string): boolean =>
      pairs.some((pair) => pair.fromId === from && pair.toId === to);
    const friendCountOf = (id: string): number =>
      this.friendships.filter((pair) => pair.fromId === id || pair.toId === id).length;
    return {
      friends: this.friendOf(actorId, targetId) !== undefined,
      actorAsked: has(this.requests, actorId, targetId),
      targetAsked: has(this.requests, targetId, actorId),
      actorBlocked: has(this.blocks, actorId, targetId),
      targetBlocked: has(this.blocks, targetId, actorId),
      actorFriendCount: friendCountOf(actorId),
      targetFriendCount: friendCountOf(targetId),
      actorOutgoingCount: this.requests.filter((pair) => pair.fromId === actorId).length,
      actorBlockCount: this.blocks.filter((pair) => pair.fromId === actorId).length,
    };
  }

  private insertFriendship(oneId: string, otherId: string, at: Date): void {
    const { userLow, userHigh } = canonicalPair(oneId, otherId);
    this.friendships.push({ fromId: userLow, toId: userHigh, at });
  }

  private friendOf(userId: string, friendId: string): RelatedAccountRow | undefined {
    const { userLow, userHigh } = canonicalPair(userId, friendId);
    const pair = this.friendships.find((row) => row.fromId === userLow && row.toId === userHigh);
    return pair ? this.rowOf(friendId, pair.at) : undefined;
  }

  private friendsOf(userId: string): RelatedAccountRow[] {
    return this.friendships
      .filter((pair) => pair.fromId === userId || pair.toId === userId)
      .map((pair) => this.rowOf(pair.fromId === userId ? pair.toId : pair.fromId, pair.at));
  }

  private blockOf(blockerId: string, blockedId: string): RelatedAccountRow | undefined {
    const pair = this.blocks.find((row) => row.fromId === blockerId && row.toId === blockedId);
    return pair ? this.rowOf(blockedId, pair.at) : undefined;
  }

  private deleteRequests(oneId: string, otherId: string): number {
    const before = this.requests.length;
    const kept = this.requests.filter(
      (pair) =>
        !([pair.fromId, pair.toId].includes(oneId) && [pair.fromId, pair.toId].includes(otherId)),
    );
    this.requests.splice(0, this.requests.length, ...kept);
    return before - kept.length;
  }

  private removeFrom(pairs: Pair[], oneId: string, otherId: string, eitherWay: boolean): boolean {
    const index = pairs.findIndex(
      (pair) =>
        (pair.fromId === oneId && pair.toId === otherId) ||
        (eitherWay && pair.fromId === otherId && pair.toId === oneId),
    );
    if (index < 0) return false;
    pairs.splice(index, 1);
    return true;
  }

  private removeSeats(ownerId: string, userId: string): string[] {
    const left = this.seats.filter((seat) => seat.ownerId === ownerId && seat.userId === userId);
    const kept = this.seats.filter((seat) => !left.includes(seat));
    this.seats.splice(0, this.seats.length, ...kept);
    return left.map((seat) => seat.campaignId);
  }

  private rowsOf(
    pairs: Pair[],
    keep: (pair: Pair) => boolean,
    side: 'fromId' | 'toId',
  ): RelatedAccountRow[] {
    return pairs.filter(keep).map((pair) => this.rowOf(pair[side], pair.at));
  }

  private rowOf(userId: string, at: Date): RelatedAccountRow {
    const account = this.accounts.find((known) => known.id === userId);
    if (!account) throw new Error(`fake has no account ${userId}; expected one of the known ids`);
    const { username, name } = account;
    const plan = 'free' as const;
    return {
      userId,
      username,
      name,
      colorChoice: null,
      avatarId: null,
      plan,
      role: 'user',
      lorkariumOwner: false,
      at,
    };
  }
}

/** Every `friends:changed` the service asked for, in order. */
export class FriendsChangedFake implements FriendsChangedPort {
  readonly changes: FriendsChange[] = [];

  async friendsChanged(change: FriendsChange): Promise<void> {
    this.changes.push(change);
  }
}

/** Every member taken out of a table, in order. */
export class MemberRemovedFake implements MemberRemovedPort {
  readonly removals: MemberRemoval[] = [];

  async memberRemoved(removal: MemberRemoval): Promise<void> {
    this.removals.push(removal);
  }
}

/** The memberships forgotten, as `campaignId:userId`. */
export class ForgottenMembershipsFake {
  readonly forgotten: string[] = [];

  forget(campaignId: string, userId: string): void {
    this.forgotten.push(`${campaignId}:${userId}`);
  }
}

/** Who blocked whom, for the campaign join: `blocked` holds `blockerId:blockedId`. */
export class UserBlocksDaoFake implements Pick<UserBlocksDao, 'exists'> {
  readonly blocked = new Set<string>();

  async exists(blockerId: string, blockedId: string): Promise<boolean> {
    return this.blocked.has(`${blockerId}:${blockedId}`);
  }
}
