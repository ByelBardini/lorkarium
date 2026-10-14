import type { CampaignDto } from '@fixture/contracts';
import type { CampaignsDao } from './campaigns.dao';
import { toCampaignBo, toCampaignDto } from './campaigns.mapper';

export class CampaignsService {
  constructor(private readonly campaigns: CampaignsDao) {}

  async rename(requesterId: string, campaignId: string, name: string): Promise<CampaignDto | null> {
    const row = await this.campaigns.findById(campaignId);
    if (!row) return null;
    const renamed = toCampaignBo(row).renamedBy(requesterId, name);
    await this.campaigns.saveName(campaignId, renamed.name);
    return toCampaignDto(renamed);
  }
}
