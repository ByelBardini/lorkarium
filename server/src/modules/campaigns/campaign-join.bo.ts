import type { UserRoleDto } from '@lorkarium/contracts';
import {
  CampaignNotFoundError,
  CampaignPasswordInvalidError,
  CampaignPasswordRequiredError,
} from './campaigns.error';

/** Outcome of checking the password sent against the campaign, computed by the service. */
export type PasswordCheck = 'not-required' | 'missing' | 'matches' | 'mismatch';

export type JoinDecision = 'already-member' | 'join-as-spectator';

export type CampaignJoinState = Readonly<{
  campaignId: string;
  isMember: boolean;
  hasPassword: boolean;
  isPublic: boolean;
  /** Admins look after every table: no code, no password, private or not. */
  readerIsAdmin: boolean;
}>;

/** Whether "Explorar mesas" also lists the private campaigns for this reader (admins only).
 *
 *  Example: `seesPrivateInExplore('admin') // true` */
export function seesPrivateInExplore(role: UserRoleDto): boolean {
  return role === 'admin';
}

/** Whether someone holding the join code (or picking a public campaign) gets in, and how:
 *  newcomers watch until the master promotes them; members keep their role.
 *
 *  Example: `new CampaignJoinBo({ campaignId, isMember: false, hasPassword: true }).decide('missing') // throws CAMPAIGN_PASSWORD_REQUIRED` */
export class CampaignJoinBo {
  constructor(private readonly state: CampaignJoinState) {}

  /** Joining without the code ("Explorar mesas") only reaches a public campaign (or any, for an
   *  admin); a private one answers as if it did not exist, so its id leaks nothing. */
  requirePublic(): void {
    if (this.state.isPublic || this.state.readerIsAdmin) return;
    throw new CampaignNotFoundError({ publicCampaignId: this.state.campaignId });
  }

  // A member re-joining is idempotent: the password is not asked again.
  needsPasswordCheck(): boolean {
    return !this.state.isMember && !this.state.readerIsAdmin && this.state.hasPassword;
  }

  decide(check: PasswordCheck): JoinDecision {
    if (this.state.isMember) return 'already-member';
    if (!this.state.hasPassword || this.state.readerIsAdmin) return 'join-as-spectator';
    return this.decideWithPassword(check);
  }

  private decideWithPassword(check: PasswordCheck): JoinDecision {
    const { campaignId } = this.state;
    if (check === 'matches') return 'join-as-spectator';
    if (check === 'missing') throw new CampaignPasswordRequiredError(campaignId);
    if (check === 'mismatch') throw new CampaignPasswordInvalidError(campaignId);
    throw new Error(`campaign ${campaignId} has a password; expected a check, received ${check}`);
  }
}
