import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { MemberNotFoundError } from './member-cards.error';

/** The member whose card is being edited, and whether they are on the table. */
export type MemberCardTarget = Readonly<{ memberId: string; isMember: boolean }>;

/** Who may edit the card of a member: the member and the masters; the whole table sees it.
 *
 *  Example: `new MemberCardBo(access, { memberId: biaId, isMember: true }).requireEdit()` */
export class MemberCardBo {
  constructor(
    private readonly access: CampaignAccessBo,
    private readonly target: MemberCardTarget,
  ) {}

  /** Throws MEMBER_NOT_FOUND for an id outside the table, FORBIDDEN for a player on another's card. */
  requireEdit(): void {
    const { memberId, isMember } = this.target;
    if (!isMember) throw new MemberNotFoundError(this.access.campaignIdOf(), memberId);
    if (this.access.isUser(memberId) || this.access.isMaster()) return;
    this.access.forbid(`edit the card of ${memberId}`, 'being that member or the master role');
  }
}
