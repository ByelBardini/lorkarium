import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';

/** Who made a board piece (a drawing, an area of effect). */
export type AuthoredPiece = Readonly<{
  id: string;
  authorId: string | null;
}>;

/** What one member may do with pieces that have an author: everyone creates; the author edits
 *  their own, the master any of them. `noun` names the piece in the refusal ("drawing",
 *  "effect area").
 *
 *  Example: `new AuthoredAccessBo(campaignAccess, 'drawing').requireEdit('move', { id, authorId })` */
export class AuthoredAccessBo {
  constructor(
    private readonly campaign: CampaignAccessBo,
    private readonly noun: string,
  ) {}

  requireEdit(action: string, piece: AuthoredPiece): void {
    if (this.campaign.isMaster()) return;
    if (piece.authorId !== null && this.campaign.isUser(piece.authorId)) return;
    this.campaign.forbid(`${action} ${this.noun} ${piece.id}`, 'the master role or authorship');
  }
}
