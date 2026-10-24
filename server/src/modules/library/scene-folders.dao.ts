import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import {
  sceneFolders,
  type NewSceneFolderPo,
  type SceneFolderChangesPo,
  type SceneFolderPo,
} from './scene-folders.po';

function folderOfCampaign(campaignId: string, folderId: string): SQL | undefined {
  return and(eq(sceneFolders.campaignId, campaignId), eq(sceneFolders.id, folderId));
}

export class SceneFoldersDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async insert(folder: NewSceneFolderPo): Promise<SceneFolderPo> {
    const [row] = await this.db.insert(sceneFolders).values(folder).returning();
    if (!row)
      throw new Error(
        `insert into scene_folders returned no row for campaign ${folder.campaignId}`,
      );
    return row;
  }

  /** Every folder of the campaign, in creation order; the tree is rebuilt from `parentId`. */
  async listOfCampaign(campaignId: string): Promise<SceneFolderPo[]> {
    return this.db
      .select()
      .from(sceneFolders)
      .where(eq(sceneFolders.campaignId, campaignId))
      .orderBy(asc(sceneFolders.createdAt), asc(sceneFolders.id));
  }

  /** Renames or moves a folder of the campaign; `undefined` when the campaign has no such one. */
  async update(
    campaignId: string,
    folderId: string,
    changes: SceneFolderChangesPo,
  ): Promise<SceneFolderPo | undefined> {
    const [row] = await this.db
      .update(sceneFolders)
      .set(changes)
      .where(folderOfCampaign(campaignId, folderId))
      .returning();
    return row;
  }

  /** Puts the folders of the campaign under `parentId` (`null` = the root). */
  async moveChildren(
    campaignId: string,
    folderIds: readonly string[],
    parentId: string | null,
  ): Promise<void> {
    if (folderIds.length === 0) return;
    await this.db
      .update(sceneFolders)
      .set({ parentId })
      .where(
        and(eq(sceneFolders.campaignId, campaignId), inArray(sceneFolders.id, [...folderIds])),
      );
  }

  /** Deletes the folder of the campaign; its subfolders and scenes fall to the root by the
   *  `SET NULL` of the foreign keys. `false` when the campaign has no such folder. */
  async delete(campaignId: string, folderId: string): Promise<boolean> {
    const rows = await this.db
      .delete(sceneFolders)
      .where(folderOfCampaign(campaignId, folderId))
      .returning({ id: sceneFolders.id });
    return rows.length > 0;
  }
}
