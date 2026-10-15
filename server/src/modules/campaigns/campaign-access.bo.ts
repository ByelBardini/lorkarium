import type { CampaignMemberPo } from './campaign-members.po';
import { CampaignNotFoundError } from './campaigns.error';

export type CampaignRole = CampaignMemberPo['role'];

export type CampaignMembershipState = Readonly<{
  campaignId: string;
  userId: string;
  role: CampaignRole | null;
}>;

/** What a user may see of one campaign, by their membership in it (`role: null` = not a member).
 *
 *  Example: `new CampaignAccessBo({ campaignId, userId, role: null }).requireMember() // throws CAMPAIGN_NOT_FOUND` */
export class CampaignAccessBo {
  constructor(private readonly membership: CampaignMembershipState) {}

  requireMember(): void {
    if (this.membership.role) return;
    const { campaignId, userId } = this.membership;
    throw new CampaignNotFoundError({ campaignId, userId });
  }

  // The code lets anyone in, so only the master hands it out.
  canSeeJoinCode(): boolean {
    return this.membership.role === 'master';
  }
}
