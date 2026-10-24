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

  /** The campaign, locked until the transaction ends: the library edits of one table queue
   *  here, so two of them never decide on the same tree. `NO KEY UPDATE`, so rows that only
   *  point at the campaign (an asset, a folder) are still inserted meanwhile. Call it on a DAO
   *  built with the `tx`. */
  async lockById(campaignId: string): Promise<CampaignPo | undefined> {
    const [row] = await this.db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .for('no key update');
    return row;
  }

  async setActiveScene(campaignId: string, sceneId: string): Promise<void> {
    await this.db
      .update(campaigns)
      .set({ activeSceneId: sceneId })
      .where(eq(campaigns.id, campaignId));
  }

  /** Writes the settings; `undefined` when the campaign is gone. Only the fields present change.
   *
   *  Example: `await dao.update(campaignId, { name: 'Vharn', updatedAt: now })` */
  async update(campaignId: string, patch: Partial<NewCampaignPo>): Promise<CampaignPo | undefined> {
    const [row] = await this.db
      .update(campaigns)
      .set(patch)
      .where(eq(campaigns.id, campaignId))
      .returning();
    return row;
  }

  /** A new join code; a taken one throws the unique violation (`23505`), like `insert`. */
  async replaceJoinCode(campaignId: string, joinCode: string, at: Date): Promise<boolean> {
    const rows = await this.db
      .update(campaigns)
      .set({ joinCode, updatedAt: at })
      .where(eq(campaigns.id, campaignId))
      .returning({ id: campaigns.id });
    return rows.length > 0;
  }

  /** Deletes the campaign; the foreign keys cascade to everything of it (members, scenes and what
   *  is on them, sheets, conditions, folders, assets). `false` when it was already gone. */
  async delete(campaignId: string): Promise<boolean> {
    const rows = await this.db
      .delete(campaigns)
      .where(eq(campaigns.id, campaignId))
      .returning({ id: campaigns.id });
    return rows.length > 0;
  }

  async findByJoinCode(joinCode: string): Promise<CampaignPo | undefined> {
    const [row] = await this.db.select().from(campaigns).where(eq(campaigns.joinCode, joinCode));
    return row;
  }
}
