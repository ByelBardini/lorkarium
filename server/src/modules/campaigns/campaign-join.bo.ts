import { CampaignPasswordInvalidError, CampaignPasswordRequiredError } from './campaigns.error';

/** Outcome of checking the password sent against the campaign, computed by the service. */
export type PasswordCheck = 'not-required' | 'missing' | 'matches' | 'mismatch';

export type JoinDecision = 'already-member' | 'join-as-player';

export type CampaignJoinState = Readonly<{
  campaignId: string;
  isMember: boolean;
  hasPassword: boolean;
}>;

/** Whether someone holding the join code gets in, and how.
 *
 *  Example: `new CampaignJoinBo({ campaignId, isMember: false, hasPassword: true }).decide('missing') // throws CAMPAIGN_PASSWORD_REQUIRED` */
export class CampaignJoinBo {
  constructor(private readonly state: CampaignJoinState) {}

  // A member re-joining is idempotent: the password is not asked again.
  needsPasswordCheck(): boolean {
    return !this.state.isMember && this.state.hasPassword;
  }

  decide(check: PasswordCheck): JoinDecision {
    if (this.state.isMember) return 'already-member';
    if (!this.state.hasPassword) return 'join-as-player';
    return this.decideWithPassword(check);
  }

  private decideWithPassword(check: PasswordCheck): JoinDecision {
    const { campaignId } = this.state;
    if (check === 'matches') return 'join-as-player';
    if (check === 'missing') throw new CampaignPasswordRequiredError(campaignId);
    if (check === 'mismatch') throw new CampaignPasswordInvalidError(campaignId);
    throw new Error(`campaign ${campaignId} has a password; expected a check, received ${check}`);
  }
}
