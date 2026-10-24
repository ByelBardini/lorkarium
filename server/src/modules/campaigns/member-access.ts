import type { CampaignAccessBo } from './campaign-access.bo';
import type { CampaignMembersDao } from './campaign-members.dao';
import { toCampaignAccessBo } from './campaigns.mapper';

type MembershipFinder = Pick<CampaignMembersDao, 'findMembership'>;

async function accessOf(
  members: MembershipFinder,
  campaignId: string,
  userId: string,
): Promise<CampaignAccessBo> {
  const membership = await members.findMembership(campaignId, userId);
  return toCampaignAccessBo(campaignId, userId, membership);
}

/** The access of a member who acts at the table (every write); the spectator gets FORBIDDEN and
 *  someone outside it CAMPAIGN_NOT_FOUND (critério 14).
 *
 *  Example: `const access = await memberAccessOf(deps.members, campaignId, userId)` */
export async function memberAccessOf(
  members: MembershipFinder,
  campaignId: string,
  userId: string,
): Promise<CampaignAccessBo> {
  const access = await accessOf(members, campaignId, userId);
  access.requireMember();
  return access;
}

/** The access of anyone who sees the table, spectator included — only for reads; someone outside
 *  it gets CAMPAIGN_NOT_FOUND (critério 14).
 *
 *  Example: `const access = await viewerAccessOf(deps.members, campaignId, userId)` */
export async function viewerAccessOf(
  members: MembershipFinder,
  campaignId: string,
  userId: string,
): Promise<CampaignAccessBo> {
  const access = await accessOf(members, campaignId, userId);
  access.requireViewer();
  return access;
}
