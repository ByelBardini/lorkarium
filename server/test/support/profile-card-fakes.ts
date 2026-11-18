import type { BadgeDto, ReputationSummaryDto } from '@lorkarium/contracts';
import type { AccountBadgesPort } from '../../src/modules/profiles/account-badges.port';
import type { ProfileCardPresencePort } from '../../src/modules/profiles/profile-card-presence.port';
import type { RelationReadingRow } from '../../src/modules/friends/friendships.dao';
import type {
  MutualCampaignRow,
  ProfileCardAccountRow,
  ProfileCardSeatCounts,
} from '../../src/modules/profiles/profile-card.dao';
import type {
  CardRelationReading,
  ProfileCardParts,
} from '../../src/modules/profiles/profile-card.mapper';

const BANNER_ID = '0d4b5a0e-6a3f-4c35-9f43-3c9a1f2b7e10';

/** Caio's card account on a paid plan, with a banner stored. */
export function cardAccountRow(
  overrides: Partial<ProfileCardAccountRow> = {},
): ProfileCardAccountRow {
  return {
    id: '7b1e4a52-2f86-4a1d-9a52-3c0e7d1f6b21',
    username: 'caio',
    name: 'Caio',
    color: null,
    bio: null,
    avatarId: null,
    bannerId: BANNER_ID,
    gameSystems: null,
    playSchedule: null,
    contact: null,
    rollsCount: 0,
    natural20Count: 0,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    role: 'user',
    plan: 'narrador',
    activePaidPlan: null,
    lorkariumOwner: false,
    ...overrides,
  };
}

export const NO_RELATION: CardRelationReading = {
  friends: false,
  actorAsked: false,
  targetAsked: false,
  actorBlocked: false,
  targetBlocked: false,
};

export const NO_VOTES: ReputationSummaryDto = { up: 0, down: 0, myVote: null, percent: null };

/** Every block of the card, with no relation and nothing in common. */
export function cardParts(overrides: Partial<ProfileCardParts> = {}): ProfileCardParts {
  return {
    account: cardAccountRow(),
    relation: 'none',
    visiblyOnline: true,
    seats: { asMaster: 0, asPlayer: 0 },
    reputation: NO_VOTES,
    mutualCampaigns: [],
    mutualFriends: 0,
    badges: [],
    ...overrides,
  };
}

/** Presence by a fixed set of visibly online accounts. */
export class ProfileCardPresenceFake implements ProfileCardPresencePort {
  constructor(private readonly online: ReadonlySet<string> = new Set()) {}

  isVisiblyOnline(userId: string): boolean {
    return this.online.has(userId);
  }
}

/** The card reads over a fixed set of accounts; nothing in common unless set. */
export class ProfileCardDaoFake {
  seats: ProfileCardSeatCounts = { asMaster: 0, asPlayer: 0 };
  mutualCampaigns: MutualCampaignRow[] = [];
  mutualFriends = 0;
  readonly asked: string[] = [];

  constructor(private readonly accounts: readonly ProfileCardAccountRow[]) {}

  async accountOf(userId: string): Promise<ProfileCardAccountRow | undefined> {
    return this.accounts.find((account) => account.id === userId);
  }

  async accountIdByUsername(username: string): Promise<string | undefined> {
    this.asked.push(`username:${username}`);
    return this.accounts.find((account) => account.username === username)?.id;
  }

  async seatCountsOf(userId: string): Promise<ProfileCardSeatCounts> {
    this.asked.push(`seats:${userId}`);
    return this.seats;
  }

  async mutualCampaignsOf(oneId: string, otherId: string): Promise<MutualCampaignRow[]> {
    this.asked.push(`campaigns:${oneId}:${otherId}`);
    return this.mutualCampaigns;
  }

  async mutualFriendsOf(oneId: string, otherId: string): Promise<number> {
    this.asked.push(`friends:${oneId}:${otherId}`);
    return this.mutualFriends;
  }
}

/** `relationBetween` answering one fixed reading, the counts zeroed. */
export class CardRelationFake {
  constructor(private readonly reading: CardRelationReading = NO_RELATION) {}

  async relationBetween(): Promise<RelationReadingRow> {
    return {
      ...this.reading,
      actorFriendCount: 0,
      targetFriendCount: 0,
      actorOutgoingCount: 0,
      actorBlockCount: 0,
    };
  }
}

/** One fixed summary; records who asked about whom. */
export class ReputationSummaryFake {
  readonly asked: string[] = [];

  constructor(private readonly summary: ReputationSummaryDto = NO_VOTES) {}

  async summaryOf(targetId: string, viewerId: string): Promise<ReputationSummaryDto> {
    this.asked.push(`${targetId}<-${viewerId}`);
    return this.summary;
  }
}

/** A fixed set of badges per account; any other account shows none. Records who was asked. */
export class AccountBadgesFake implements AccountBadgesPort {
  readonly asked: string[] = [];

  constructor(private readonly byAccount: ReadonlyMap<string, readonly BadgeDto[]> = new Map()) {}

  async badgesOf(userId: string): Promise<BadgeDto[]> {
    this.asked.push(userId);
    return [...(this.byAccount.get(userId) ?? [])];
  }
}
