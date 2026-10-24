import type { CampaignAccessBo, CampaignRole } from '../campaigns/campaign-access.bo';
import { MemberNotFoundError } from '../campaigns/campaigns.error';

/** The member whose card is being edited, and their role at the table (`null` = not on it). */
export type MemberCardTarget = Readonly<{ memberId: string; role: CampaignRole | null }>;

/** Who may edit the card of a member: the member and the masters; the whole table sees it. A
 *  spectator has no card (the table keeps no trace of them), so they are no target at all.
 *
 *  Example: `new MemberCardBo(access, { memberId: biaId, role: 'player' }).requireEdit()` */
export class MemberCardBo {
  constructor(
    private readonly access: CampaignAccessBo,
    private readonly target: MemberCardTarget,
  ) {}

  /** Throws MEMBER_NOT_FOUND for an id outside the table or of a spectator, FORBIDDEN for a
   *  player on another's card. */
  requireEdit(): void {
    const { memberId, role } = this.target;
    if (role === null || role === 'spectator') {
      throw new MemberNotFoundError(this.access.campaignIdOf(), memberId);
    }
    if (this.access.isUser(memberId) || this.access.isMaster()) return;
    this.access.forbid(`edit the card of ${memberId}`, 'being that member or the master role');
  }
}
