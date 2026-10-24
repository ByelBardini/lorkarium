import type { CampaignMemberPo } from './campaign-members.po';
import { CampaignNotFoundError, ForbiddenActionError } from './campaigns.error';

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

  /** The member's role; someone who is not a member gets CAMPAIGN_NOT_FOUND. */
  requireMember(): CampaignRole {
    if (this.membership.role) return this.membership.role;
    const { campaignId, userId } = this.membership;
    throw new CampaignNotFoundError({ campaignId, userId });
  }

  /** Only the master may `action` (spec §3.9); a non-member still gets CAMPAIGN_NOT_FOUND.
   *
   *  Example: `access.requireMaster('configure the grid')` */
  requireMaster(action: string): void {
    if (this.isMaster()) return;
    this.forbid(action, 'the master role');
  }

  /** Whether the member is the master; a non-member gets CAMPAIGN_NOT_FOUND. */
  isMaster(): boolean {
    return this.requireMember() === 'master';
  }

  /** The table this access is about, for the errors that cite it. */
  campaignIdOf(): string {
    return this.membership.campaignId;
  }

  /** Who asked, for the errors that cite them. */
  userIdOf(): string {
    return this.membership.userId;
  }

  /** Whether `userId` is the member this access was built for. */
  isUser(userId: string): boolean {
    return this.membership.userId === userId;
  }

  /** Refuses `action` with FORBIDDEN, citing who asked, the table and what it takes.
   *
   *  Example: `access.forbid('move token 5d4c…', 'the master role or control of the token')` */
  forbid(action: string, required: string): never {
    const { campaignId, userId } = this.membership;
    throw new ForbiddenActionError(campaignId, userId, action, required);
  }

  // The code lets anyone in, so only the master hands it out.
  canSeeJoinCode(): boolean {
    return this.membership.role === 'master';
  }
}
