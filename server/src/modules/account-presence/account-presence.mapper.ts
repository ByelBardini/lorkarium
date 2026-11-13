import type { FriendPresenceDto, PresenceFriendChangedDto } from '@lorkarium/contracts';
import type { CampaignPo } from '../campaigns/campaigns.po';
import type { OpenedTable, SeenPresence } from './account-presence.bo';

/** One friend's line of the `presence:sync` answer.
 *
 *  Example: `toFriendPresenceDto(biaId, bo.seen()) // { userId, status: 'online', table: null }` */
export function toFriendPresenceDto(userId: string, seen: SeenPresence): FriendPresenceDto {
  return { userId, status: seen.status, table: seen.table };
}

/** `presence:friendChanged` as the friends of `userId` hear it.
 *
 *  Example: `toPresenceFriendChangedDto(biaId, bo.seen(), clock.now())` */
export function toPresenceFriendChangedDto(
  userId: string,
  seen: SeenPresence,
  at: Date,
): PresenceFriendChangedDto {
  return { ...toFriendPresenceDto(userId, seen), at: at.toISOString() };
}

/** The table a tab opened, as the presence keeps it: only a public one is ever shown.
 *
 *  Example: `toOpenedTable(campaign) // { campaignId, name: 'Vharn', isPublic: true }` */
export function toOpenedTable(
  campaign: Pick<CampaignPo, 'id' | 'name' | 'visibility'>,
): OpenedTable {
  return {
    campaignId: campaign.id,
    name: campaign.name,
    isPublic: campaign.visibility === 'public',
  };
}
