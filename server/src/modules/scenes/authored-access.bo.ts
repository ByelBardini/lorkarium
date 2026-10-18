import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { TokenLayerPo } from '../tokens/tokens.po';

/** Who made a board piece (a drawing, an area of effect) and where it lies. */
export type AuthoredPiece = Readonly<{
  id: string;
  authorId: string | null;
  layer: TokenLayerPo;
}>;

/** What one member may do with pieces that have an author: everyone creates, a player only on
 *  the `tokens` layer; the author edits their own (on `tokens`), the master any of them. `noun`
 *  names the piece in the refusal ("drawing", "effect area").
 *
 *  Example: `new AuthoredAccessBo(campaignAccess, 'drawing').requireEdit('move', { id, authorId, layer })` */
export class AuthoredAccessBo {
  constructor(
    private readonly campaign: CampaignAccessBo,
    private readonly noun: string,
  ) {}

  requireLayer(action: string, layer: TokenLayerPo): void {
    if (layer === 'tokens' || this.campaign.isMaster()) return;
    this.campaign.forbid(`${action} on the ${layer} layer`, 'the master role');
  }

  requireEdit(action: string, piece: AuthoredPiece): void {
    if (this.campaign.isMaster()) return;
    const isAuthor = piece.authorId !== null && this.campaign.isUser(piece.authorId);
    if (!isAuthor) {
      this.campaign.forbid(`${action} ${this.noun} ${piece.id}`, 'the master role or authorship');
    }
    if (piece.layer === 'tokens') return;
    this.campaign.forbid(
      `${action} ${this.noun} ${piece.id} on the ${piece.layer} layer`,
      `the master role, or authorship of a ${this.noun} on the tokens layer`,
    );
  }
}
