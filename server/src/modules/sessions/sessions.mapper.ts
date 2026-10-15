import type {
  SessionMemberJoinedDto,
  SessionMemberLeftDto,
  SessionStateDto,
} from '@lorkarium/contracts';
import type { CampaignMemberRow } from '../campaigns/campaign-members.dao';
import { TablePresenceBo, type PresenceRoster } from './table-presence.bo';

/** Members + roster → the snapshot a joining client starts from (the `session:state` of §7.2).
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
    members: members.map((member) => ({ ...member, online: presence.isOnline(member.userId) })),
    at: at.toISOString(),
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
  const { userId, name, role } = member;
  return {
    campaignId,
    version,
    member: { userId, name, role, online: true },
    at: at.toISOString(),
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
