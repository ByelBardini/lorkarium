import { and, eq, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { assets, type AssetPo } from '../assets/assets.po';
import {
  libraryImages,
  type LibraryImagePo,
  type NewLibraryImagePo,
  type LibraryImageChangesPo,
} from './library-images.po';
export type LibraryImageRow = Readonly<{ image: LibraryImagePo; asset: AssetPo }>;
export class LibraryImagesDao {
  constructor(private readonly db: DatabaseExecutor) {}
  async listOfCampaign(campaignId: string): Promise<LibraryImageRow[]> {
    return this.db
      .select({ image: libraryImages, asset: assets })
      .from(libraryImages)
      .innerJoin(
        assets,
        and(eq(assets.id, libraryImages.assetId), eq(assets.campaignId, libraryImages.campaignId)),
      )
      .where(eq(libraryImages.campaignId, campaignId))
      .orderBy(libraryImages.createdAt, libraryImages.id);
  }
  async findInCampaign(campaignId: string, imageId: string): Promise<LibraryImageRow | undefined> {
    const [row] = await this.db
      .select({ image: libraryImages, asset: assets })
      .from(libraryImages)
      .innerJoin(
        assets,
        and(eq(assets.id, libraryImages.assetId), eq(assets.campaignId, libraryImages.campaignId)),
      )
      .where(and(eq(libraryImages.campaignId, campaignId), eq(libraryImages.id, imageId)));
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
