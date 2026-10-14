import { eq } from 'drizzle-orm';
import type { Database } from '../../database/database';
import { campaigns, type CampaignPo } from './campaigns.po';

export class CampaignsDao {
  constructor(private readonly db: Database) {}

  async findById(campaignId: string): Promise<CampaignPo | undefined> {
    const [row] = await this.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    return row;
  }

  async saveName(campaignId: string, name: string): Promise<void> {
    await this.db.update(campaigns).set({ name }).where(eq(campaigns.id, campaignId));
  }
}
