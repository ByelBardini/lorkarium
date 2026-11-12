import type { CampaignMemberDto, PlanCountResource } from '@lorkarium/contracts';
import { effectiveLimitsOf, PlanLimitsBo } from '../plans/plan-limits.bo';
import type { CampaignRole } from './campaign-access.bo';
import type { CachedMemberships } from './cached-memberships';
import type { CampaignMembersDao } from './campaign-members.dao';
import type { CampaignsDao } from './campaigns.dao';
import { MemberNotFoundError } from './campaigns.error';
import { toCampaignMemberDto, toMemberRoleBo } from './campaigns.mapper';
import type { MemberRoleChangedPort } from './member-role-changed.port';
import type { MemberSeatPort } from './member-seat.port';
import type { PresenceReaderPort } from './presence-reader.port';

export type MemberRoleServiceDeps = Readonly<{
  /** The campaign's owner, whose role nobody changes and who alone (with a juggernaut) manages
   *  the masters. */
  campaigns: Pick<CampaignsDao, 'findById'>;
  members: Pick<CampaignMembersDao, 'findMembership' | 'listMembers'>;
  /** The role and its seat (the member's character) are written in one transaction. */
  transaction: MemberRoleTransactionRunner;
  /** The remembered membership of the target is dropped, so their next command reads the role. */
  memberships: Pick<CachedMemberships, 'forget'>;
  changed: MemberRoleChangedPort;
  /** The `online` of the member answered back. */
  presence: PresenceReaderPort;
}>;

type RoleShift = Readonly<{ from: CampaignRole; to: CampaignRole }>;

/** What the role's transaction writes with: the table locked with its owner's plan, the
 *  membership (counted and written) and the seat, bound to the same `tx`. */
export type MemberRoleWriteDaos = Readonly<{
  campaigns: Pick<CampaignsDao, 'lockWithOwner'>;
  members: Pick<CampaignMembersDao, 'updateRole' | 'countByRole'>;
  seat: MemberSeatPort;
}>;

// A spectator has no ceiling here: the member moved down was already at the table.
const PLAN_SEAT_OF_ROLE: Readonly<Partial<Record<CampaignRole, PlanCountResource>>> = {
  player: 'players',
  master: 'masters',
};

export type MemberRoleTransactionRunner = <T>(
  work: (daos: MemberRoleWriteDaos) => Promise<T>,
) => Promise<T>;

export type MemberRoleRequest = Readonly<{
  campaignId: string;
  targetId: string;
  role: CampaignRole;
}>;

/** A master changes a member's role (any master swaps players and spectators; owner powers also
 *  promote to and demote from master): decide, save the role and its seat in one transaction,
 *  forget the remembered membership, then tell the live table (its rooms first, then the seat) —
 *  in this order. Asking for the role the member already has writes and tells nothing.
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
    const told = { campaignId, userId: targetId, role: change.to, from: change.from };
    const notice = await this.deps.transaction(async (daos) => {
      const { members, seat } = daos;
      await requirePlanSeat(daos, { campaignId, userId: targetId, role: change.to });
      const row = await members.updateRole(campaignId, targetId, change.to);
      if (!row) throw new MemberNotFoundError(campaignId, targetId);
      return seat.roleSaved(told);
    });
    this.deps.memberships.forget(campaignId, targetId);
    // The rooms move first: a promoted member is already in their own room for the seat's event.
    await this.deps.changed.memberRoleChanged(told);
    notice();
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

/** Locks the table and counts the destination role against the owner's plan, before the write.
 *
 *  Example: `await requirePlanSeat(daos, { campaignId, userId: dudaId, role: 'player' })` */
async function requirePlanSeat(
  { campaigns, members }: MemberRoleWriteDaos,
  {
    campaignId,
    userId,
    role,
  }: Readonly<{ campaignId: string; userId: string; role: CampaignRole }>,
): Promise<void> {
  const locked = await campaigns.lockWithOwner(campaignId);
  if (!locked) throw new MemberNotFoundError(campaignId, userId);
  const resource = PLAN_SEAT_OF_ROLE[role];
  if (!resource) return;
  const seated = await members.countByRole(campaignId, role);
  PlanLimitsBo.requireRoom(resource, seated, 1, effectiveLimitsOf(locked.owner));
}
