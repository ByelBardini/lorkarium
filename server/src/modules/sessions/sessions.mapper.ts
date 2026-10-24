import type {
  CampaignInfoDto,
  SessionCampaignDeletedDto,
  SessionCampaignUpdatedDto,
  SessionMemberActivityDto,
  SessionMemberDto,
  SessionMemberJoinedDto,
  SessionMemberLeftDto,
  SessionMemberUpdatedDto,
  SessionStateDto,
} from '@lorkarium/contracts';
import { memberColorOf } from '@lorkarium/game-core';
import type { CampaignMemberRow } from '../campaigns/campaign-members.dao';
import { TablePresenceBo, type PresenceRoster } from './table-presence.bo';

/** Members + roster → the snapshot a joining client starts from (the `session:state` of §7.2);
 *  a spectator who is not online is left out.
 *
 *  Example: `toSessionStateDto(campaignId, members, outcome.roster, clock.now()).version // 1` */
export function toSessionStateDto(
  campaignId: string,
  members: readonly CampaignMemberRow[],
  roster: PresenceRoster,
  at: Date,
): SessionStateDto {
  const presence = new TablePresenceBo(roster);
  return {
    campaignId,
    version: roster.version,
    members: members
      .filter((member) => presence.lists(member))
      .map((member) => toSessionMemberDto(member, presence)),
    at: at.toISOString(),
  };
}

/** Member + presence → one member of the snapshot: the profile the table sees (nickname, @,
 *  effective color, photo, bio) and whether they are online or away.
 *
 *  Example: `toSessionMemberDto(bia, new TablePresenceBo(roster)).color // 'rose'` */
export function toSessionMemberDto(
  member: CampaignMemberRow,
  presence: TablePresenceBo,
): SessionMemberDto {
  return {
    ...profileOf(member),
    online: presence.isOnline(member.userId),
    awaySince: presence.awaySinceOf(member.userId)?.toISOString() ?? null,
  };
}

/** Member → `session:memberJoined`.
 *
 *  Example: `toMemberJoinedDto(campaignId, bia, outcome.roster.version, clock.now())` */
export function toMemberJoinedDto(
  campaignId: string,
  member: CampaignMemberRow,
  version: number,
  at: Date,
): SessionMemberJoinedDto {
  return {
    campaignId,
    version,
    member: { ...profileOf(member), online: true, awaySince: null },
    at: at.toISOString(),
  };
}

/** Member read again after a profile change + roster → `session:memberUpdated`.
 *
 *  Example: `toMemberUpdatedDto(campaignId, ana, outcome.roster, clock.now()).version // 4` */
export function toMemberUpdatedDto(
  campaignId: string,
  member: CampaignMemberRow,
  roster: PresenceRoster,
  at: Date,
): SessionMemberUpdatedDto {
  return {
    campaignId,
    version: roster.version,
    member: toSessionMemberDto(member, new TablePresenceBo(roster)),
    at: at.toISOString(),
  };
}

/** The campaign read again after a save + the roster version it moved to → the event.
 *
 *  Example: `toCampaignUpdatedDto(campaign, outcome.roster.version, clock.now()).campaign.name` */
export function toCampaignUpdatedDto(
  campaign: CampaignInfoDto,
  version: number,
  at: Date,
): SessionCampaignUpdatedDto {
  return { campaignId: campaign.id, version, campaign, at: at.toISOString() };
}

/** The deleted campaign → the event; no version follows, the room is emptied after it.
 *
 *  Example: `toCampaignDeletedDto(campaignId, clock.now()).campaignId` */
export function toCampaignDeletedDto(campaignId: string, at: Date): SessionCampaignDeletedDto {
  return { campaignId, at: at.toISOString() };
}

function profileOf(member: CampaignMemberRow): Omit<SessionMemberDto, 'online' | 'awaySince'> {
  return {
    userId: member.userId,
    name: member.name,
    username: member.username,
    color: memberColorOf(member.userId, member.colorChoice),
    avatarId: member.avatarId,
    bio: member.bio,
    role: member.role,
  };
}

/** User id → `session:memberLeft`.
 *
 *  Example: `toMemberLeftDto(campaignId, userId, outcome.roster.version, clock.now())` */
export function toMemberLeftDto(
  campaignId: string,
  userId: string,
  version: number,
  at: Date,
): SessionMemberLeftDto {
  return { campaignId, version, userId, at: at.toISOString() };
}

/** A member going away (`awaySince` set) or coming back (`null`) → `session:memberActivity`.
 *
 *  Example: `toMemberActivityDto(campaignId, userId, presence.awaySinceOf(userId), version, now)` */
export function toMemberActivityDto(
  campaignId: string,
  userId: string,
  awaySince: Date | null,
  version: number,
  at: Date,
): SessionMemberActivityDto {
  return {
    campaignId,
    version,
    userId,
    awaySince: awaySince?.toISOString() ?? null,
    at: at.toISOString(),
  };
}
