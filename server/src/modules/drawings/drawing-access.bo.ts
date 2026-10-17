import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { TokenLayerPo } from '../tokens/tokens.po';

export type DrawingOwnership = Readonly<{
  drawingId: string;
  authorId: string | null;
  layer: TokenLayerPo;
}>;

/** What one member may do with drawings: everyone draws, a player only on the `tokens` layer;
 *  the author moves and deletes their own (on `tokens`), the master any of them.
 *
 *  Example: `new DrawingAccessBo(campaignAccess).requireEdit('move', { drawingId, authorId, layer })` */
export class DrawingAccessBo {
  constructor(private readonly campaign: CampaignAccessBo) {}

  requireLayer(action: string, layer: TokenLayerPo): void {
    if (layer === 'tokens' || this.campaign.isMaster()) return;
    this.campaign.forbid(`${action} on the ${layer} layer`, 'the master role');
  }

  requireEdit(action: string, drawing: DrawingOwnership): void {
    if (this.campaign.isMaster()) return;
    const isAuthor = drawing.authorId !== null && this.campaign.isUser(drawing.authorId);
    if (!isAuthor) {
      this.campaign.forbid(
        `${action} drawing ${drawing.drawingId}`,
        'the master role or authorship',
      );
    }
    if (drawing.layer === 'tokens') return;
    this.campaign.forbid(
      `${action} drawing ${drawing.drawingId} on the ${drawing.layer} layer`,
      'the master role, or authorship of a drawing on the tokens layer',
    );
  }
}
