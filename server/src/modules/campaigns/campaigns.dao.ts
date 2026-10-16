import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { campaigns, type CampaignPo, type NewCampaignPo } from './campaigns.po';

export class CampaignsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async insert(campaign: NewCampaignPo): Promise<CampaignPo> {
    const [row] = await this.db.insert(campaigns).values(campaign).returning();
    if (!row) throw new Error(`insert into campaigns returned no row for name ${campaign.name}`);
    return row;
  }

  async findById(campaignId: string): Promise<CampaignPo | undefined> {
    const [row] = await this.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    return row;
  }

  async setActiveScene(campaignId: string, sceneId: string): Promise<void> {
    await this.db
      .update(campaigns)
      .set({ activeSceneId: sceneId })
      .where(eq(campaigns.id, campaignId));
  }

  async findByJoinCode(joinCode: string): Promise<CampaignPo | undefined> {
    const [row] = await this.db.select().from(campaigns).where(eq(campaigns.joinCode, joinCode));
    return row;
  }
}
