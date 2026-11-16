import type { ProfileCardDto, ReputationSummaryDto } from '@lorkarium/contracts';
import type { FriendshipsDao } from '../friends/friendships.dao';
import type { AccountBadgesPort } from './account-badges.port';
import type { ProfileCardPresencePort } from './profile-card-presence.port';
import type { ProfileCardAccountRow, ProfileCardDao } from './profile-card.dao';
import { profileCardRelationOf, toProfileCardDto } from './profile-card.mapper';
import { ProfileCardNotFoundError } from './profiles.error';

export type ProfileCardServiceDeps = Readonly<{
  cards: Pick<
    ProfileCardDao,
    'accountOf' | 'accountIdByUsername' | 'seatCountsOf' | 'mutualCampaignsOf' | 'mutualFriendsOf'
  >;
  friendships: Pick<FriendshipsDao, 'relationBetween'>;
  reputation: { summaryOf(targetId: string, viewerId: string): Promise<ReputationSummaryDto> };
  presence: ProfileCardPresencePort;
  badges: AccountBadgesPort;
}>;

/** Another account's card as the session's account reads it.
 *
 *  Example: `await new ProfileCardService(deps).cardOf(biaId, caioId)` */
export class ProfileCardService {
  constructor(private readonly deps: ProfileCardServiceDeps) {}

  /** Throws `PROFILE_NOT_FOUND` for an unknown or suspended account.
   *
   *  Example: `(await service.cardOf(biaId, caioId)).relation // 'none'` */
  async cardOf(viewerId: string, targetId: string): Promise<ProfileCardDto> {
    const account = await this.requireAccount(targetId);
    const { cards, friendships, reputation, presence, badges } = this.deps;
    const [reading, seats, summary, mutualCampaigns, mutualFriends, shown] = await Promise.all([
      friendships.relationBetween(viewerId, targetId),
      cards.seatCountsOf(targetId),
      reputation.summaryOf(targetId, viewerId),
      cards.mutualCampaignsOf(viewerId, targetId),
      cards.mutualFriendsOf(viewerId, targetId),
      badges.badgesOf(targetId),
    ]);
    return toProfileCardDto({
      account,
      relation: profileCardRelationOf(reading, viewerId === targetId),
      visiblyOnline: presence.isVisiblyOnline(targetId),
      seats,
      reputation: summary,
      mutualCampaigns,
      mutualFriends,
      badges: shown,
    });
  }

  /** The card behind an exact @ (already in lower case); unknown and suspended are the same
   *  `PROFILE_NOT_FOUND`, so the lookup never tells a suspension apart.
   *
   *  Example: `(await service.cardByUsername(biaId, 'caio')).username // 'caio'` */
  async cardByUsername(viewerId: string, username: string): Promise<ProfileCardDto> {
    const targetId = await this.deps.cards.accountIdByUsername(username);
    if (targetId === undefined) throw new ProfileCardNotFoundError(`@${username}`);
    return this.cardOf(viewerId, targetId);
  }

  private async requireAccount(targetId: string): Promise<ProfileCardAccountRow> {
    const account = await this.deps.cards.accountOf(targetId);
    if (account) return account;
    throw new ProfileCardNotFoundError(targetId);
  }
}
