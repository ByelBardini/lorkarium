import { and, asc, eq, getTableColumns, inArray, sql, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { assets } from '../assets/assets.po';
import { campaigns } from '../campaigns/campaigns.po';
import { tokens } from '../tokens/tokens.po';
import {
  scenes,
  type NewScenePo,
  type SceneConfigPo,
  type SceneLibraryChangesPo,
  type ScenePo,
} from './scenes.po';

/** The scene with the pixels of its background image (both `null` without one): the client
 *  derives the proportion from them. */
export type SceneRow = ScenePo &
  Readonly<{ backgroundWidth: number | null; backgroundHeight: number | null }>;

/** A scene as the library lists it: the row, its background pixels and how many tokens it has. */
export type LibrarySceneRow = SceneRow & Readonly<{ tokenCount: number }>;

/** A grid reached by its address (the group one or a `sceneId`): the row and whether it is the
 *  group grid, which decides who may reach it while private. */
export type AddressedSceneRow = SceneRow & Readonly<{ isActive: boolean }>;

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

const tokenCountOfScene = sql<number>`(
  SELECT count(*) FROM ${tokens} WHERE ${tokens.sceneId} = ${scenes.id}
)`.mapWith(Number);

/** Whether the scene is its table's group grid; the query must join `campaigns`. */
export const IS_GROUP_GRID = sql<boolean>`coalesce(${campaigns.activeSceneId} = ${scenes.id}, false)`;

const addressedScene = { ...sceneWithBackground, isActive: IS_GROUP_GRID };

/** Absent `sceneId` = the group grid; either way only a scene of the campaign itself (§2.6). The
 *  query must join `campaigns` on `scenes.campaign_id`.
 *
 *  Example: `db.select().from(scenes).innerJoin(campaigns, …).where(gridOfCampaign(id, torreId))` */
export function gridOfCampaign(campaignId: string, sceneId: string | undefined): SQL | undefined {
  const which =
    sceneId === undefined ? eq(scenes.id, campaigns.activeSceneId) : eq(scenes.id, sceneId);
  return and(eq(campaigns.id, campaignId), eq(scenes.campaignId, campaignId), which);
}

function sceneOfCampaign(campaignId: string, sceneId: string): SQL | undefined {
  return and(eq(scenes.campaignId, campaignId), eq(scenes.id, sceneId));
}

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

  /** The grid a board command addresses (absent `sceneId` = the group grid), locked until the
   *  transaction ends; `undefined` when the campaign has no such grid. Call it on the `tx` DAO.
   *
   *  Example: `const torre = await new ScenesDao(tx).lockInCampaign(campaignId, torreId)` */
  async lockInCampaign(
    campaignId: string,
    sceneId?: string,
  ): Promise<AddressedSceneRow | undefined> {
    const [row] = await this.db
      .select(addressedScene)
      .from(scenes)
      .innerJoin(campaigns, eq(campaigns.id, scenes.campaignId))
      .leftJoin(assets, backgroundOfScene)
      .where(gridOfCampaign(campaignId, sceneId))
      .for('update', { of: scenes });
    return row;
  }

  /** The grid with its row and its table's row share-locked until the transaction ends: a change
   *  of who reaches it (visibility, the group grid) waits for the holder, or the holder for it.
   *  Call it on the `tx` DAO.
   *
   *  Example: `const torre = await new ScenesDao(tx).shareInCampaign(campaignId, torreId)` */
  async shareInCampaign(
    campaignId: string,
    sceneId: string,
  ): Promise<AddressedSceneRow | undefined> {
    const [row] = await this.db
      .select(addressedScene)
      .from(scenes)
      .innerJoin(campaigns, eq(campaigns.id, scenes.campaignId))
      .leftJoin(assets, backgroundOfScene)
      .where(gridOfCampaign(campaignId, sceneId))
      .for('share', { of: [scenes, campaigns] });
    return row;
  }

  /** The grid a snapshot addresses (absent `sceneId` = the group grid), without a lock.
   *
   *  Example: `const torre = await scenesDao.findGridInCampaign(campaignId, torreId)` */
  async findGridInCampaign(
    campaignId: string,
    sceneId?: string,
  ): Promise<AddressedSceneRow | undefined> {
    const [row] = await this.db
      .select(addressedScene)
      .from(scenes)
      .innerJoin(campaigns, eq(campaigns.id, scenes.campaignId))
      .leftJoin(assets, backgroundOfScene)
      .where(gridOfCampaign(campaignId, sceneId));
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

  /** Every scene of the campaign with its token count, in creation order (the library). */
  async listOfCampaign(campaignId: string): Promise<LibrarySceneRow[]> {
    return this.db
      .select({ ...sceneWithBackground, tokenCount: tokenCountOfScene })
      .from(scenes)
      .leftJoin(assets, backgroundOfScene)
      .where(eq(scenes.campaignId, campaignId))
      .orderBy(asc(scenes.createdAt), asc(scenes.id));
  }

  /** One scene as the library lists it, only if it belongs to the campaign. */
  async findLibraryRow(campaignId: string, sceneId: string): Promise<LibrarySceneRow | undefined> {
    const [row] = await this.db
      .select({ ...sceneWithBackground, tokenCount: tokenCountOfScene })
      .from(scenes)
      .leftJoin(assets, backgroundOfScene)
      .where(sceneOfCampaign(campaignId, sceneId));
    return row;
  }

  /** The scene only if it belongs to the campaign: an id of another table finds nothing. */
  async findInCampaign(campaignId: string, sceneId: string): Promise<SceneRow | undefined> {
    const [row] = await this.db
      .select(sceneWithBackground)
      .from(scenes)
      .leftJoin(assets, backgroundOfScene)
      .where(sceneOfCampaign(campaignId, sceneId));
    return row;
  }

  /** Saves only the library keys it receives; `undefined` when the campaign has no such scene. */
  async updateLibrary(
    campaignId: string,
    sceneId: string,
    changes: SceneLibraryChangesPo,
  ): Promise<ScenePo | undefined> {
    const [row] = await this.db
      .update(scenes)
      .set({ ...changes, updatedAt: sql`now()` })
      .where(sceneOfCampaign(campaignId, sceneId))
      .returning();
    return row;
  }

  /** Puts the scenes of the campaign in `folderId` (`null` = no folder). */
  async moveScenes(
    campaignId: string,
    sceneIds: readonly string[],
    folderId: string | null,
  ): Promise<void> {
    if (sceneIds.length === 0) return;
    await this.db
      .update(scenes)
      .set({ folderId, updatedAt: sql`now()` })
      .where(and(eq(scenes.campaignId, campaignId), inArray(scenes.id, [...sceneIds])));
  }

  /** Deletes the scene of the campaign and, in cascade, everything on it. */
  async delete(campaignId: string, sceneId: string): Promise<boolean> {
    const rows = await this.db
      .delete(scenes)
      .where(sceneOfCampaign(campaignId, sceneId))
      .returning({ id: scenes.id });
    return rows.length > 0;
  }
}
