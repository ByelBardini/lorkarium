import type { CampaignDetailDto, EndJuggernautResponseDto } from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CachedMemberships } from './cached-memberships';
import type { CampaignRole } from './campaign-access.bo';
import type { CampaignMembersDao } from './campaign-members.dao';
import type { CampaignsDao } from './campaigns.dao';
import { CampaignNotFoundError } from './campaigns.error';
import { toJuggernautBo } from './campaigns.mapper';
import type { CampaignsService } from './campaigns.service';
import type { JuggernautBo } from './juggernaut.bo';
import type { MemberRemovedPort } from './member-removed.port';
import type { MemberRoleChangedPort } from './member-role-changed.port';

export type JuggernautServiceDeps = Readonly<{
  campaigns: Pick<CampaignsDao, 'findById'>;
  members: Pick<
    CampaignMembersDao,
    'findMembership' | 'startJuggernaut' | 'endJuggernaut' | 'juggernautCampaignIdsOf'
  >;
  /** The remembered membership is dropped, so the next board command reads the new seat. */
  memberships: Pick<CachedMemberships, 'forget'>;
  changed: MemberRoleChangedPort;
  removed: MemberRemovedPort;
  /** The detail read back after turning it on, as the admin now reads it. */
  detail: Pick<CampaignsService, 'detail'>;
  clock: ClockPort;
}>;

/** An admin turns juggernaut mode on and off at a table (the route checks the admin role): save,
 *  forget the remembered membership, then tell the live table — in this order.
 *
 *  Example: `await juggernaut.start(userOf(request).id, campaignId)` */
export class JuggernautService {
  constructor(private readonly deps: JuggernautServiceDeps) {}

  /** On: master with owner powers. A member is heard with the new role; someone who was not a
   *  member is told to nobody (an offline juggernaut leaves no trace; they show when they open
   *  the table).
   *
   *  Example: `(await juggernaut.start(rootId, campaignId)).juggernaut // true` */
  async start(userId: string, campaignId: string): Promise<CampaignDetailDto> {
    const decision = (await this.boOf(userId, campaignId)).start();
    if (decision.change === 'started') {
      await this.deps.members.startJuggernaut(campaignId, userId, this.deps.clock.now());
      this.deps.memberships.forget(campaignId, userId);
      const from = decision.roleBefore;
      if (from)
        await this.deps.changed.memberRoleChanged({ campaignId, userId, role: 'master', from });
    }
    return this.deps.detail.detail(userId, campaignId);
  }

  /** Off: back to the role before (the table hears it), or out of the table when there was none
   *  (their connections leave it). Answers the role now, `null` = no longer a member.
   *
   *  Example: `await juggernaut.end(rootId, campaignId) // { myRole: null }` */
  async end(userId: string, campaignId: string): Promise<EndJuggernautResponseDto> {
    const decision = (await this.boOf(userId, campaignId)).end();
    if (decision.change === 'unchanged') return { myRole: decision.role };
    await this.deps.members.endJuggernaut(campaignId, userId);
    this.deps.memberships.forget(campaignId, userId);
    await this.announceEnd(campaignId, userId, decision.restore);
    return { myRole: decision.restore };
  }

  /** Turns the mode off at every table of the user, each with its own notice: an account that
   *  stops being admin keeps no privileged seat.
   *
   *  Example: `await juggernaut.endAllOf(rootId)` */
  async endAllOf(userId: string): Promise<void> {
    const campaignIds = await this.deps.members.juggernautCampaignIdsOf(userId);
    for (const campaignId of campaignIds) await this.end(userId, campaignId);
  }

  private async boOf(userId: string, campaignId: string): Promise<JuggernautBo> {
    const campaign = await this.deps.campaigns.findById(campaignId);
    if (!campaign) throw new CampaignNotFoundError({ campaignId, userId });
    const membership = await this.deps.members.findMembership(campaignId, userId);
    return toJuggernautBo(campaign, userId, membership);
  }

  private async announceEnd(
    campaignId: string,
    userId: string,
    restore: CampaignRole | null,
  ): Promise<void> {
    if (restore === null) return this.deps.removed.memberRemoved({ campaignId, userId });
    const change = { campaignId, userId, role: restore, from: 'master' as const };
    return this.deps.changed.memberRoleChanged(change);
  }
}
