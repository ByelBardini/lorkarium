import { and, eq, getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { assets } from '../assets/assets.po';
import { campaigns } from '../campaigns/campaigns.po';
import { scenes, type NewScenePo, type SceneConfigPo, type ScenePo } from './scenes.po';

/** The scene with the pixels of its background image (both `null` without one): the client
 *  derives the proportion from them. */
export type SceneRow = ScenePo &
  Readonly<{ backgroundWidth: number | null; backgroundHeight: number | null }>;

const sceneWithBackground = {
  ...getTableColumns(scenes),
  backgroundWidth: assets.width,
  backgroundHeight: assets.height,
};

// The background must be of the same campaign too: a stray id never shows another table's image.
const backgroundOfScene = and(
  eq(assets.id, scenes.backgroundAssetId),
  eq(assets.campaignId, scenes.campaignId),
);

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

  async findActiveOf(campaignId: string): Promise<SceneRow | undefined> {
    const [row] = await this.db
      .select(sceneWithBackground)
      .from(scenes)
      .innerJoin(campaigns, eq(campaigns.activeSceneId, scenes.id))
      .leftJoin(assets, backgroundOfScene)
      .where(activeSceneOfCampaign(campaignId));
    return row;
  }

  /** The active scene, locked until the transaction ends: every board mutation of the campaign
   *  queues here, so versions never interleave. Call it on a DAO built with the `tx`. */
  async lockActiveOf(campaignId: string): Promise<SceneRow | undefined> {
    const [row] = await this.db
      .select(sceneWithBackground)
      .from(scenes)
      .innerJoin(campaigns, eq(campaigns.activeSceneId, scenes.id))
      .leftJoin(assets, backgroundOfScene)
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

  async update(sceneId: string, config: SceneConfigPo): Promise<ScenePo> {
    const [row] = await this.db
      .update(scenes)
      .set({ ...config, updatedAt: sql`now()` })
      .where(eq(scenes.id, sceneId))
      .returning();
    if (!row) throw new Error(`cannot update the grid of missing scene ${sceneId}`);
    return row;
  }
}
