import type { PresenceFriendChangedDto } from '@lorkarium/contracts';
import type { AccountPresencePublisherPort } from '../../src/modules/account-presence/account-presence-publisher.port';
import type { TableInfoReader } from '../../src/modules/account-presence/account-presence.service';
import type { CampaignPo } from '../../src/modules/campaigns/campaigns.po';
import type { FriendshipsDao } from '../../src/modules/friends/friendships.dao';

/** Every `presence:friendChanged` the service sent, with the friends it went to. */
export class AccountPresencePublisherFake implements AccountPresencePublisherPort {
  readonly published: { friendIds: string[]; event: PresenceFriendChangedDto }[] = [];

  friendChanged(friendIds: readonly string[], event: PresenceFriendChangedDto): void {
    this.published.push({ friendIds: [...friendIds], event });
  }
}

/** Friend ids by account, as `FriendshipsDao.friendIdsOf` reads them; `failing` makes the next
 *  reads throw (a database that went away). */
export class FriendIdsFake implements Pick<FriendshipsDao, 'friendIdsOf'> {
  failing = false;
  readonly reads: string[] = [];

  constructor(private readonly friends: Readonly<Record<string, readonly string[]>> = {}) {}

  async friendIdsOf(userId: string): Promise<string[]> {
    this.reads.push(userId);
    if (this.failing) throw new Error(`friends of ${userId} unreadable; expected a database`);
    return [...(this.friends[userId] ?? [])];
  }
}

type KnownTable = Pick<CampaignPo, 'id' | 'name' | 'visibility'>;

/** Tables by id, as `CampaignsDao.findById` reads them (only the fields the presence uses). */
export class CampaignInfoFake implements TableInfoReader {
  constructor(private readonly tables: readonly KnownTable[]) {}

  async findById(campaignId: string): Promise<KnownTable | undefined> {
    return this.tables.find((table) => table.id === campaignId);
  }
}
