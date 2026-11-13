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
  /** The owner of the table blocked the reader: no role, admin included, lets them in. */
  blockedByOwner: boolean;
  userId: string;
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

  /** A reader the owner blocked gets the answer of a table that does not exist, so the block
   *  is never revealed; only the owner's block counts, never a co-master's.
   *
   *  Example: `join.requireNotBlocked() // throws CAMPAIGN_NOT_FOUND when the owner blocked them` */
  requireNotBlocked(): void {
    if (!this.state.blockedByOwner) return;
    const { campaignId, userId } = this.state;
    throw new CampaignNotFoundError({ campaignId, userId });
  }

  /** Joining without the code ("Explorar mesas") only reaches a public campaign (or any, for an
   *  admin); a private one answers as if it did not exist, so its id leaks nothing. */
  requirePublic(): void {
    if (this.state.isPublic || this.state.readerIsAdmin) return;
    throw new CampaignNotFoundError({ publicCampaignId: this.state.campaignId });
  }

  /** Whether only the admin role lets this reader in: a private table or one with a password. */
  bypassesGate(): boolean {
    const { readerIsAdmin, isPublic, hasPassword } = this.state;
    return readerIsAdmin && (!isPublic || hasPassword);
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
