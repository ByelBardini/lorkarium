import type {
  FriendPresenceDto,
  PresenceFriendChangedDto,
  PresenceVisibilityDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignPo } from '../campaigns/campaigns.po';
import type { FriendsChange } from '../friends/friends-changed.port';
import type { FriendshipsDao } from '../friends/friendships.dao';
import type { SchedulerPort } from '../sessions/scheduler.port';
import type { TableVisit } from '../sessions/table-opened.port';
import type { AccountPresencePublisherPort } from './account-presence-publisher.port';
import type { AccountPresenceRegistryPort } from './account-presence-registry.port';
import {
  AccountPresenceBo,
  EMPTY_ACCOUNT_PRESENCE,
  seenPresenceChanged,
  type AccountDisconnectReason,
  type AccountPresenceOutcome,
  type SeenPresence,
} from './account-presence.bo';
import {
  toFriendPresenceDto,
  toOpenedTable,
  toPresenceFriendChangedDto,
} from './account-presence.mapper';

// The same tolerance as a table's: an F5 or a short blip is not "went offline / came online".
export const ACCOUNT_PRESENCE_GRACE_MS = 5000;

/** What the presence reads of a table a tab opened; `CampaignsDao` answers it. */
export type TableInfoReader = Readonly<{
  findById(campaignId: string): Promise<Pick<CampaignPo, 'id' | 'name' | 'visibility'> | undefined>;
}>;

export type AccountPresenceServiceDeps = Readonly<{
  registry: AccountPresenceRegistryPort;
  scheduler: SchedulerPort;
  publisher: AccountPresencePublisherPort;
  friendships: Pick<FriendshipsDao, 'friendIdsOf'>;
  /** The name and visibility of a table a tab opened. */
  campaigns: TableInfoReader;
  clock: ClockPort;
  /** A presence change that could not go out (the friends read failed): logged, never thrown. */
  announceFailed: (error: unknown) => void;
}>;

/** The account's presence across every tab: saves the new state first, then tells the friends
 *  only what they see change (`seenPresenceChanged`), one announcement after the other per
 *  account. Also the sessions module's `TableOpenedPort`.
 *
 *  Example: `presence.connect(socket.data.user.id, socket.id)` */
export class AccountPresenceService {
  private readonly announcing = new Map<string, Promise<void>>();
  // The friends of each connected account, read once: a tab standing still or moving again must
  // not cost a query. Any saved change of a list forgets it (`friendsChanged`).
  private readonly friendIds = new Map<string, Promise<string[]>>();
  // Tables asked to open whose name is still being read; a close in between cancels the open.
  private readonly opening = new Set<string>();

  constructor(private readonly deps: AccountPresenceServiceDeps) {}

  connect(userId: string, socketId: string): void {
    const outcome = this.presenceOf(userId).connect(socketId);
    if (outcome.change === 'returned-in-grace' || outcome.change === 'came-back') {
      this.deps.scheduler.cancel(graceKey(userId));
    }
    this.apply(userId, outcome);
  }

  drop(userId: string, socketId: string, reason: AccountDisconnectReason): void {
    const outcome = this.presenceOf(userId).disconnect(socketId, reason);
    this.apply(userId, outcome);
    if (outcome.change !== 'grace-started') return;
    const expire = (): void => this.apply(userId, this.presenceOf(userId).expireGrace());
    this.deps.scheduler.schedule(graceKey(userId), ACCOUNT_PRESENCE_GRACE_MS, expire);
  }

  setVisibility(userId: string, visibility: PresenceVisibilityDto): void {
    this.apply(userId, this.presenceOf(userId).setVisibility(visibility));
  }

  /** Every friend of `userId` with what they show: offline ones (and invisible ones) included.
   *
   *  Example: `await presence.sync(anaId) // [{ userId: biaId, status: 'online', table: null }]` */
  async sync(userId: string): Promise<FriendPresenceDto[]> {
    const friendIds = await this.friendsOf(userId);
    return friendIds.map((friendId) => toFriendPresenceDto(friendId, this.seenOf(friendId)));
  }

  /** Online or away as friends see it: whom a direct message may reach.
   *
   *  Example: `presence.isVisiblyOnline(biaId) // false while Bia is invisible` */
  isVisiblyOnline(userId: string): boolean {
    return this.presenceOf(userId).isVisiblyOnline();
  }

  tableOpened(visit: TableVisit): void {
    this.opening.add(visitKey(visit));
    void this.openTable(visit).catch((error: unknown) => this.deps.announceFailed(error));
  }

  tableClosed(visit: TableVisit): void {
    this.opening.delete(visitKey(visit));
    this.apply(
      visit.userId,
      this.presenceOf(visit.userId).closeTable(visit.socketId, visit.campaignId),
    );
  }

  tableLeftEverywhere(userId: string, campaignId: string): void {
    const tables = this.deps.registry.presenceOf(userId)?.tables ?? [];
    for (const { socketId, table } of tables) {
      if (table.campaignId === campaignId) this.tableClosed({ userId, campaignId, socketId });
    }
  }

  activityChanged(userId: string, socketId: string, away: boolean): void {
    const presence = this.presenceOf(userId);
    this.apply(userId, away ? presence.markAway(socketId) : presence.markActive(socketId));
  }

  private async openTable(visit: TableVisit): Promise<void> {
    const campaign = await this.deps.campaigns.findById(visit.campaignId);
    if (!this.opening.delete(visitKey(visit)) || !campaign) return;
    const outcome = this.presenceOf(visit.userId).openTable(
      visit.socketId,
      toOpenedTable(campaign),
    );
    this.apply(visit.userId, outcome);
  }

  private apply(userId: string, outcome: AccountPresenceOutcome): void {
    const before = this.deps.registry.presenceOf(userId) ?? EMPTY_ACCOUNT_PRESENCE;
    if (outcome.state === before) return;
    this.deps.registry.save(userId, outcome.state);
    const gone = this.deps.registry.presenceOf(userId) === undefined;
    if (!seenPresenceChanged(before, outcome.state)) {
      if (gone) this.friendIds.delete(userId);
      return;
    }
    const seen = new AccountPresenceBo(outcome.state).seen();
    this.announce(userId, toPresenceFriendChangedDto(userId, seen, this.deps.clock.now()));
  }

  // Chained per account: a fast online → away must not reach the friends as away → online.
  private announce(userId: string, event: PresenceFriendChangedDto): void {
    const previous = this.announcing.get(userId) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        const friendIds = await this.friendsOf(userId);
        if (friendIds.length > 0) this.deps.publisher.friendChanged(friendIds, event);
        // Offline for good: nothing of the account is kept, its friends included.
        if (event.status === 'offline' && !this.deps.registry.presenceOf(userId)) {
          this.friendIds.delete(userId);
        }
      })
      .catch((error: unknown) => this.deps.announceFailed(error));
    this.announcing.set(userId, next);
    void next.then(() => {
      if (this.announcing.get(userId) === next) this.announcing.delete(userId);
    });
  }

  /** A saved change of these accounts' lists: their friends are read again on the next need.
   *
   *  Example: `await presence.friendsChanged({ userIds: [anaId, biaId], at })` */
  async friendsChanged({ userIds }: FriendsChange): Promise<void> {
    for (const userId of userIds) this.friendIds.delete(userId);
  }

  private friendsOf(userId: string): Promise<string[]> {
    const known = this.friendIds.get(userId);
    if (known) return known;
    const read = this.deps.friendships.friendIdsOf(userId);
    this.friendIds.set(userId, read);
    // A failed read is not remembered: the next change tries the database again.
    read.catch(() => {
      if (this.friendIds.get(userId) === read) this.friendIds.delete(userId);
    });
    return read;
  }

  private seenOf(userId: string): SeenPresence {
    return this.presenceOf(userId).seen();
  }

  private presenceOf(userId: string): AccountPresenceBo {
    return new AccountPresenceBo(this.deps.registry.presenceOf(userId) ?? EMPTY_ACCOUNT_PRESENCE);
  }
}

function graceKey(userId: string): string {
  return `account:${userId}`;
}

function visitKey({ userId, campaignId, socketId }: TableVisit): string {
  return `${userId}:${campaignId}:${socketId}`;
}
