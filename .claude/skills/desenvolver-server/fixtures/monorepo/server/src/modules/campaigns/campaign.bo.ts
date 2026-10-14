import type { CampaignPo } from './campaigns.po';
import { NotCampaignOwnerError } from './campaigns.error';

/** The business rules of one campaign, built from its persisted row.
 *
 *  Example: `new CampaignBo(row).renamedBy(ownerId, 'Curse of Strahd').name` */
export class CampaignBo {
  constructor(private readonly campaign: CampaignPo) {}

  renamedBy(requesterId: string, name: string): CampaignPo {
    if (requesterId !== this.campaign.ownerId) throw new NotCampaignOwnerError(this.campaign.id, requesterId);
    return { ...this.campaign, name: name.trim() };
  }
}
