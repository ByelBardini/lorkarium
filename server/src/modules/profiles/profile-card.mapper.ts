import type {
  BadgeDto,
  ProfileCardDto,
  ProfileCardPresence,
  ProfileCardRelation,
  ReputationSummaryDto,
} from '@lorkarium/contracts';
import { memberColorOf } from '@lorkarium/game-core';
import { accountSealFieldsOf } from '../campaigns/campaigns.mapper';
import type { RelationReadingRow } from '../friends/friendships.dao';
import { profileBannerAllowed } from '../plans/plan-limits.bo';
import type {
  MutualCampaignRow,
  ProfileCardAccountRow,
  ProfileCardSeatCounts,
} from './profile-card.dao';

/** The relation as the reader sees it: `actor` is the reader, `target` the card's account. */
export type CardRelationReading = Pick<
  RelationReadingRow,
  'friends' | 'actorAsked' | 'targetAsked' | 'actorBlocked' | 'targetBlocked'
>;

/** Every block the card is built from, already read. */
export type ProfileCardParts = Readonly<{
  account: ProfileCardAccountRow;
  relation: ProfileCardRelation;
  /** Online or away as friends see it (invisible reads false). */
  visiblyOnline: boolean;
  seats: ProfileCardSeatCounts;
  reputation: ReputationSummaryDto;
  mutualCampaigns: readonly MutualCampaignRow[];
  mutualFriends: number;
  /** Granted badges with an image, in catalog order. */
  badges: readonly BadgeDto[];
}>;

/** The relation the card shows. Being blocked by the other reads as no relation: the block is
 *  never revealed (only the reader's own pending request stays, as the friends screen shows it).
 *
 *  Example: `profileCardRelationOf(reading, false) // 'none' when the other blocked the reader` */
export function profileCardRelationOf(
  reading: CardRelationReading,
  self: boolean,
): ProfileCardRelation {
  if (self) return 'self';
  if (reading.actorBlocked) return 'blocked';
  if (reading.friends) return 'friend';
  if (reading.actorAsked) return 'outgoing';
  if (reading.targetAsked && !reading.targetBlocked) return 'incoming';
  return 'none';
}

/** Presence only between friends; invisible reads as offline.
 *
 *  Example: `profileCardPresenceOf('none', true) // null` */
export function profileCardPresenceOf(
  relation: ProfileCardRelation,
  visiblyOnline: boolean,
): ProfileCardPresence {
  if (relation !== 'friend') return null;
  return visiblyOnline ? 'online' : 'offline';
}

/** PO + the read blocks → the card DTO; the banner only while the plan has it (Lenda).
 *
 *  Example: `toProfileCardDto(parts).bannerId // null below Lenda` */
export function toProfileCardDto(parts: ProfileCardParts): ProfileCardDto {
  const { account, relation } = parts;
  return {
    id: account.id,
    username: account.username,
    name: account.name,
    color: memberColorOf(account.id, account.color),
    avatarId: account.avatarId,
    bannerId: profileBannerAllowed(account) ? account.bannerId : null,
    bio: account.bio,
    memberSince: account.createdAt.toISOString(),
    ...accountSealFieldsOf(account),
    presence: profileCardPresenceOf(relation, parts.visiblyOnline),
    relation,
    rollsCount: account.rollsCount,
    natural20Count: account.natural20Count,
    campaignsAsMaster: parts.seats.asMaster,
    campaignsAsPlayer: parts.seats.asPlayer,
    reputation: parts.reputation,
    gameSystems: account.gameSystems,
    playSchedule: account.playSchedule,
    contact: account.contact,
    mutualCampaigns: parts.mutualCampaigns.map(({ id, name }) => ({ id, name })),
    mutualFriends: parts.mutualFriends,
    badges: [...parts.badges],
  };
}
