import type { CampaignMemberDto } from '@lorkarium/contracts';
import type { CampaignRole } from './campaign-access.bo';
import type { CachedMemberships } from './cached-memberships';
import type { CampaignMembersDao } from './campaign-members.dao';
import type { CampaignsDao } from './campaigns.dao';
import { MemberNotFoundError } from './campaigns.error';
import { toCampaignMemberDto, toMemberRoleBo } from './campaigns.mapper';
import type { MemberRoleChangedPort } from './member-role-changed.port';
import type { PresenceReaderPort } from './presence-reader.port';

export type MemberRoleServiceDeps = Readonly<{
  /** The campaign's owner, whose role nobody changes and who alone (with a juggernaut) manages
   *  the masters. */
  campaigns: Pick<CampaignsDao, 'findById'>;
  members: Pick<CampaignMembersDao, 'findMembership' | 'updateRole' | 'listMembers'>;
  /** The remembered membership of the target is dropped, so their next command reads the role. */
  memberships: Pick<CachedMemberships, 'forget'>;
  changed: MemberRoleChangedPort;
  /** The `online` of the member answered back. */
  presence: PresenceReaderPort;
}>;

type RoleShift = Readonly<{ from: CampaignRole; to: CampaignRole }>;

export type MemberRoleRequest = Readonly<{
  campaignId: string;
  targetId: string;
  role: CampaignRole;
}>;

/** A master changes a member's role (any master swaps players and spectators; owner powers also
 *  promote to and demote from master): decide, save, forget the remembered membership, then tell
 *  the live table — in this order. Asking for the role the member already
 *  has writes and tells nothing.
 *
 *  Example: `await roles.change(userOf(request).id, { campaignId, targetId: dudaId, role: 'player' })` */
export class MemberRoleService {
  constructor(private readonly deps: MemberRoleServiceDeps) {}

  async change(userId: string, request: MemberRoleRequest): Promise<CampaignMemberDto> {
    const { campaignId, targetId, role } = request;
    const { members } = this.deps;
    const requester = await members.findMembership(campaignId, userId);
    const target = await members.findMembership(campaignId, targetId);
    const ownerId = (await this.deps.campaigns.findById(campaignId))?.ownerId ?? null;
    const lookup = { campaignId, userId, targetId, requester, target, ownerId };
    const decision = toMemberRoleBo(lookup).decide(role);
    if (decision.change === 'changed') await this.write(campaignId, targetId, decision);
    return this.memberOf(campaignId, targetId);
  }

  private async write(campaignId: string, targetId: string, change: RoleShift): Promise<void> {
    const row = await this.deps.members.updateRole(campaignId, targetId, change.to);
    if (!row) throw new MemberNotFoundError(campaignId, targetId);
    this.deps.memberships.forget(campaignId, targetId);
    const told = { campaignId, userId: targetId, role: change.to, from: change.from };
    await this.deps.changed.memberRoleChanged(told);
  }

  // Read back after the write: the answer carries the profile and the role the table now sees.
  private async memberOf(campaignId: string, targetId: string): Promise<CampaignMemberDto> {
    const rows = await this.deps.members.listMembers(campaignId);
    const member = rows.find((row) => row.userId === targetId);
    if (!member) throw new MemberNotFoundError(campaignId, targetId);
    const online = this.deps.presence.onlineUserIdsOf(campaignId).has(targetId);
    return toCampaignMemberDto(member, online);
  }
}
