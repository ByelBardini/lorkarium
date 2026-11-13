import type {
  BlockRequestDto,
  BlockedUserDto,
  FriendDto,
  FriendRequestResponseDto,
  FriendsOverviewDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { UsersDao } from '../auth/users.dao';
import type { CachedMemberships } from '../campaigns/cached-memberships';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { MemberRemovedPort } from '../campaigns/member-removed.port';
import { FriendRelationBo, type FriendLimits, type RelationDecision } from './friend-relation.bo';
import type { FriendRequestsDao } from './friend-requests.dao';
import type { FriendsChangedPort } from './friends-changed.port';
import { FriendUserNotFoundError } from './friends.error';
import {
  toBlockedUserDto,
  toFriendDto,
  toFriendRelationState,
  toFriendRequestEntryDto,
} from './friends.mapper';
import type { FriendshipsDao, RelatedAccountRow } from './friendships.dao';
import type { UserBlocksDao } from './user-blocks.dao';

/** What a write reads and writes with, all on the same `tx`. */
export type FriendsWriteDaos = Readonly<{
  friendships: Pick<
    FriendshipsDao,
    'lockPair' | 'relationBetween' | 'insert' | 'remove' | 'friendOf'
  >;
  requests: Pick<FriendRequestsDao, 'insert' | 'deleteBetween'>;
  blocks: Pick<UserBlocksDao, 'insert' | 'remove' | 'blockOf'>;
  /** The seats of the blocked account in the tables the blocker owns. */
  seats: Pick<CampaignMembersDao, 'removeFromOwnedBy'>;
}>;

export type FriendsTransactionRunner = <T>(
  work: (daos: FriendsWriteDaos) => Promise<T>,
) => Promise<T>;

export type FriendsReadDaos = Readonly<{
  friendships: Pick<FriendshipsDao, 'friendsOf'>;
  requests: Pick<FriendRequestsDao, 'incomingOf' | 'outgoingOf'>;
  blocks: Pick<UserBlocksDao, 'blockedBy'>;
}>;

export type FriendsServiceDeps = Readonly<{
  reads: FriendsReadDaos;
  accounts: Pick<UsersDao, 'findByUsername'>;
  transaction: FriendsTransactionRunner;
  changed: FriendsChangedPort;
  /** The live table: a blocked account taken out of the blocker's tables leaves them live. */
  removed: MemberRemovedPort;
  memberships: Pick<CachedMemberships, 'forget'>;
  clock: ClockPort;
  limits: FriendLimits;
}>;

// A saved write: what to answer, whom to tell, and the tables the target was taken out of.
type SavedWrite<T> = Readonly<{
  answer: T;
  notify: readonly string[];
  leftTables?: readonly string[];
}>;

type RelationWork<T> = (
  relation: FriendRelationBo,
  daos: FriendsWriteDaos,
) => Promise<SavedWrite<T>>;

/** Requests, friendships and blocks of the session's account. Every write locks both accounts in
 *  id order, reads the pair, lets `FriendRelationBo` decide, saves, and only then tells the
 *  accounts (`friends:changed`) and the live tables.
 *
 *  Example: `await friends.request(userOf(request).id, 'bia') // { outcome: 'sent' }` */
export class FriendsService {
  constructor(private readonly deps: FriendsServiceDeps) {}

  /** Example: `(await friends.overview(anaId)).incoming.length` */
  async overview(userId: string): Promise<FriendsOverviewDto> {
    const { friendships, requests, blocks } = this.deps.reads;
    const [friends, incoming, outgoing, blocked] = await Promise.all([
      friendships.friendsOf(userId),
      requests.incomingOf(userId),
      requests.outgoingOf(userId),
      blocks.blockedBy(userId),
    ]);
    return {
      friends: friends.map(toFriendDto),
      incoming: incoming.map(toFriendRequestEntryDto),
      outgoing: outgoing.map(toFriendRequestEntryDto),
      blocked: blocked.map(toBlockedUserDto),
    };
  }

  /** A request by @; `accepted` when the other one had asked first.
   *
   *  Example: `await friends.request(anaId, 'bia') // { outcome: 'accepted' }` */
  async request(actorId: string, username: string): Promise<FriendRequestResponseDto> {
    const target = await this.deps.accounts.findByUsername(username);
    if (!target) throw new FriendUserNotFoundError(`@${username}`);
    return this.write<FriendRequestResponseDto>(actorId, target.id, async (relation, daos) => {
      const decision = relation.request();
      const at = this.deps.clock.now();
      if (decision.action !== 'accept-incoming') {
        await daos.requests.insert(actorId, target.id, at);
        return { answer: { outcome: 'sent' }, notify: decision.notify };
      }
      await this.befriend(daos, actorId, target.id, at);
      return { answer: { outcome: 'accepted' }, notify: decision.notify };
    });
  }

  /** Example: `await friends.accept(biaId, anaId) // the friend Ana, since now` */
  async accept(actorId: string, fromUserId: string): Promise<FriendDto> {
    return this.write(actorId, fromUserId, async (relation, daos) => {
      const { notify } = relation.accept();
      await this.befriend(daos, actorId, fromUserId, this.deps.clock.now());
      const friend = await daos.friendships.friendOf(actorId, fromUserId);
      return { answer: toFriendDto(requireRow(friend, actorId, fromUserId)), notify };
    });
  }

  /** Declines a received request or cancels a sent one.
   *
   *  Example: `await friends.withdraw(biaId, anaId)` */
  async withdraw(actorId: string, otherId: string): Promise<void> {
    await this.write(actorId, otherId, async (relation, daos) => {
      const { notify } = relation.withdraw();
      await daos.requests.deleteBetween(actorId, otherId);
      return { answer: undefined, notify };
    });
  }

  /** Example: `await friends.unfriend(anaId, biaId)` */
  async unfriend(actorId: string, friendId: string): Promise<void> {
    await this.write(actorId, friendId, async (relation, daos) => {
      const { notify } = relation.unfriend();
      await daos.friendships.remove(actorId, friendId);
      return { answer: undefined, notify };
    });
  }

  /** Blocks by id or @: the friendship and the requests go, and so do the target's seats in the
   *  tables the actor owns (they leave them live after the commit).
   *
   *  Example: `await friends.block(anaId, { username: 'caio' }) // the blocked Caio` */
  async block(actorId: string, blockTarget: BlockRequestDto): Promise<BlockedUserDto> {
    const targetId = await this.targetIdOf(blockTarget);
    return this.write(actorId, targetId, (relation, daos) =>
      this.saveBlock(relation.block(), daos, actorId, targetId),
    );
  }

  /** Unblocking does not make them friends again.
   *
   *  Example: `await friends.unblock(anaId, caioId)` */
  async unblock(actorId: string, blockedId: string): Promise<void> {
    await this.write(actorId, blockedId, async (relation, daos) => {
      const { notify } = relation.unblock();
      await daos.blocks.remove(actorId, blockedId);
      return { answer: undefined, notify };
    });
  }

  private async saveBlock(
    decision: RelationDecision<{ endsFriendship: boolean; dropsRequests: boolean }>,
    daos: FriendsWriteDaos,
    actorId: string,
    targetId: string,
  ): Promise<SavedWrite<BlockedUserDto>> {
    if (decision.action.endsFriendship) await daos.friendships.remove(actorId, targetId);
    if (decision.action.dropsRequests) await daos.requests.deleteBetween(actorId, targetId);
    await daos.blocks.insert(actorId, targetId, this.deps.clock.now());
    const leftTables = await daos.seats.removeFromOwnedBy(actorId, targetId);
    const blocked = requireRow(await daos.blocks.blockOf(actorId, targetId), actorId, targetId);
    return { answer: toBlockedUserDto(blocked), notify: decision.notify, leftTables };
  }

  // The id in the body is the account to block, never the requester (that one is `actorId`).
  private async targetIdOf(blockTarget: BlockRequestDto): Promise<string> {
    if ('userId' in blockTarget) return blockTarget.userId;
    const target = await this.deps.accounts.findByUsername(blockTarget.username);
    if (!target) throw new FriendUserNotFoundError(`@${blockTarget.username}`);
    return target.id;
  }

  private async befriend(
    daos: FriendsWriteDaos,
    oneId: string,
    otherId: string,
    at: Date,
  ): Promise<void> {
    await daos.requests.deleteBetween(oneId, otherId);
    await daos.friendships.insert(oneId, otherId, at);
  }

  private async write<T>(actorId: string, targetId: string, work: RelationWork<T>): Promise<T> {
    const saved = await this.deps.transaction(async (daos) => {
      const locked = await daos.friendships.lockPair(actorId, targetId);
      if (!locked.includes(targetId)) throw new FriendUserNotFoundError(targetId);
      return work(await this.relationOf(daos, actorId, targetId), daos);
    });
    await this.announce(saved, targetId);
    return saved.answer;
  }

  private async relationOf(
    daos: FriendsWriteDaos,
    actorId: string,
    targetId: string,
  ): Promise<FriendRelationBo> {
    const reading = await daos.friendships.relationBetween(actorId, targetId);
    return new FriendRelationBo(
      toFriendRelationState(actorId, targetId, reading),
      this.deps.limits,
    );
  }

  private async announce(saved: SavedWrite<unknown>, targetId: string): Promise<void> {
    for (const campaignId of saved.leftTables ?? []) {
      this.deps.memberships.forget(campaignId, targetId);
      await this.deps.removed.memberRemoved({ campaignId, userId: targetId });
    }
    await this.deps.changed.friendsChanged({ userIds: saved.notify, at: this.deps.clock.now() });
  }
}

function requireRow(
  row: RelatedAccountRow | undefined,
  actorId: string,
  otherId: string,
): RelatedAccountRow {
  if (row) return row;
  throw new Error(`the relation of ${actorId} and ${otherId} was saved but reads back empty`);
}
