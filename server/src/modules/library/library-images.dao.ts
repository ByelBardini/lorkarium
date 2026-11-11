import { and, eq, sql, type SQL } from 'drizzle-orm';
import { hiddenByFolderSql } from '../../database/hidden-by-folder-sql';
import type { DatabaseExecutor } from '../../database/transaction';
import { assets, type AssetPo } from '../assets/assets.po';
import {
  libraryImages,
  type LibraryImagePo,
  type NewLibraryImagePo,
  type LibraryImageChangesPo,
} from './library-images.po';
export type LibraryImageRow = Readonly<{
  image: LibraryImagePo;
  asset: AssetPo;
  hiddenByFolder: boolean;
}>;
const IMAGE_WITH_ASSET = {
  image: libraryImages,
  asset: assets,
  hiddenByFolder: hiddenByFolderSql('"library_images"."folder_id"'),
};
export class LibraryImagesDao {
  constructor(private readonly db: DatabaseExecutor) {}
  async listOfCampaign(campaignId: string): Promise<LibraryImageRow[]> {
    return this.db
      .select(IMAGE_WITH_ASSET)
      .from(libraryImages)
      .innerJoin(
        assets,
        and(eq(assets.id, libraryImages.assetId), eq(assets.campaignId, libraryImages.campaignId)),
      )
      .where(eq(libraryImages.campaignId, campaignId))
      .orderBy(libraryImages.createdAt, libraryImages.id);
  }
  async findInCampaign(campaignId: string, imageId: string): Promise<LibraryImageRow | undefined> {
    return this.findOne(
      and(eq(libraryImages.campaignId, campaignId), eq(libraryImages.id, imageId)),
    );
  }
  /** The library record of one file, by the unique `asset_id`; another table's is `undefined`.
   *
   *  Example: `(await dao.findByAsset(vharnId, assetId))?.image.visibility // 'public'` */
  async findByAsset(campaignId: string, assetId: string): Promise<LibraryImageRow | undefined> {
    return this.findOne(
      and(eq(libraryImages.campaignId, campaignId), eq(libraryImages.assetId, assetId)),
    );
  }

  private async findOne(where: SQL | undefined): Promise<LibraryImageRow | undefined> {
    const [row] = await this.db
      .select(IMAGE_WITH_ASSET)
      .from(libraryImages)
      .innerJoin(
        assets,
        and(eq(assets.id, libraryImages.assetId), eq(assets.campaignId, libraryImages.campaignId)),
      )
      .where(where);
    return row;
  }

  async insert(row: NewLibraryImagePo): Promise<LibraryImagePo> {
    const [saved] = await this.db.insert(libraryImages).values(row).returning();
    if (!saved) throw new Error(`No library image inserted for ${row.assetId}`);
    return saved;
  }
  async update(campaignId: string, imageId: string, changes: LibraryImageChangesPo): Promise<void> {
    await this.db
      .update(libraryImages)
      .set({ ...changes, updatedAt: sql`now()` })
      .where(and(eq(libraryImages.campaignId, campaignId), eq(libraryImages.id, imageId)));
  }
  async delete(campaignId: string, imageId: string): Promise<void> {
    await this.db
      .delete(libraryImages)
      .where(and(eq(libraryImages.campaignId, campaignId), eq(libraryImages.id, imageId)));
  }
  async moveFromFolder(
    campaignId: string,
    folderId: string,
    parentId: string | null,
  ): Promise<void> {
    await this.db
      .update(libraryImages)
      .set({ folderId: parentId })
      .where(and(eq(libraryImages.campaignId, campaignId), eq(libraryImages.folderId, folderId)));
  }
}
