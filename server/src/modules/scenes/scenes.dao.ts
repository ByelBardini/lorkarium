import { and, eq, getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { campaigns } from '../campaigns/campaigns.po';
import { scenes, type NewScenePo, type SceneGridPo, type ScenePo } from './scenes.po';

// The active scene must also belong to the campaign: a stray active_scene_id never leaks another table.
function activeSceneOfCampaign(campaignId: string): SQL | undefined {
  return and(eq(campaigns.id, campaignId), eq(scenes.campaignId, campaignId));
}

export class ScenesDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async insert(scene: NewScenePo): Promise<ScenePo> {
    const [row] = await this.db.insert(scenes).values(scene).returning();
    if (!row)
      throw new Error(`insert into scenes returned no row for campaign ${scene.campaignId}`);
    return row;
  }

  async findById(sceneId: string): Promise<ScenePo | undefined> {
    const [row] = await this.db.select().from(scenes).where(eq(scenes.id, sceneId));
    return row;
  }

  async findActiveOf(campaignId: string): Promise<ScenePo | undefined> {
    const [row] = await this.db
      .select(getTableColumns(scenes))
      .from(scenes)
      .innerJoin(campaigns, eq(campaigns.activeSceneId, scenes.id))
      .where(activeSceneOfCampaign(campaignId));
    return row;
  }

  /** The active scene, locked until the transaction ends: every board mutation of the campaign
   *  queues here, so versions never interleave. Call it on a DAO built with the `tx`. */
  async lockActiveOf(campaignId: string): Promise<ScenePo | undefined> {
    const [row] = await this.db
      .select(getTableColumns(scenes))
      .from(scenes)
      .innerJoin(campaigns, eq(campaigns.activeSceneId, scenes.id))
      .where(activeSceneOfCampaign(campaignId))
      .for('update', { of: scenes });
    return row;
  }

  async bumpVersion(sceneId: string): Promise<number> {
    const [row] = await this.db
      .update(scenes)
      .set({ version: sql`${scenes.version} + 1`, updatedAt: sql`now()` })
      .where(eq(scenes.id, sceneId))
      .returning({ version: scenes.version });
    if (!row) throw new Error(`cannot bump the version of missing scene ${sceneId}`);
    return row.version;
  }

  async update(sceneId: string, grid: SceneGridPo): Promise<ScenePo> {
    const [row] = await this.db
      .update(scenes)
      .set({ ...grid, updatedAt: sql`now()` })
      .where(eq(scenes.id, sceneId))
      .returning();
    if (!row) throw new Error(`cannot update the grid of missing scene ${sceneId}`);
    return row;
  }
}
