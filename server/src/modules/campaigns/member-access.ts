import type { CampaignAccessBo } from './campaign-access.bo';
import type { CampaignMembersDao } from './campaign-members.dao';
import { toCampaignAccessBo } from './campaigns.mapper';

/** The access of a member of the table; someone outside it gets CAMPAIGN_NOT_FOUND (critério 14).
 *
 *  Example: `const access = await memberAccessOf(deps.members, campaignId, userId)` */
export async function memberAccessOf(
  members: Pick<CampaignMembersDao, 'findMembership'>,
  campaignId: string,
  userId: string,
): Promise<CampaignAccessBo> {
  const membership = await members.findMembership(campaignId, userId);
  const access = toCampaignAccessBo(campaignId, userId, membership);
  access.requireMember();
  return access;
}
