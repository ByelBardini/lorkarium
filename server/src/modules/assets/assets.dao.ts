import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { assets, type AssetPo, type NewAssetPo } from './assets.po';

/** What a re-encoding changes in a row: the type, the weight and the pixels of the new file. */
export type KeptImageColumns = Pick<AssetPo, 'mimeType' | 'sizeBytes' | 'width' | 'height'>;

/** The asset rows. Every read a command or a viewer makes goes through the campaign, so an id
 *  of another table finds nothing (§2.6, criterion 14). */
export class AssetsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async insert(row: NewAssetPo): Promise<AssetPo> {
    const [inserted] = await this.db.insert(assets).values(row).returning();
    if (!inserted) throw new Error(`insert into assets returned no row for key ${row.storageKey}`);
    return inserted;
  }

  /** By id alone: only for whoever then checks the membership of `campaignId` itself. */
  async findById(assetId: string): Promise<AssetPo | undefined> {
    const [row] = await this.db.select().from(assets).where(eq(assets.id, assetId));
    return row;
  }

  async findInCampaign(campaignId: string, assetId: string): Promise<AssetPo | undefined> {
    const [row] = await this.db
      .select()
      .from(assets)
      .where(and(eq(assets.campaignId, campaignId), eq(assets.id, assetId)));
    return row;
  }

  /** The asked assets that belong to `campaignId`; ids from elsewhere are skipped. */
  async findManyInCampaign(campaignId: string, assetIds: readonly string[]): Promise<AssetPo[]> {
    if (assetIds.length === 0) return [];
    return this.db
      .select()
      .from(assets)
      .where(and(eq(assets.campaignId, campaignId), inArray(assets.id, [...assetIds])));
  }

  /** The silhouette of each asked asset that belongs to `campaignId`, by asset id; ids from
   *  elsewhere are absent. No ids, no query.
   *
   *  Example: `(await dao.outlinesOf(campaignId, [imageId])).get(imageId) // polygons, [] or null` */
  async outlinesOf(
    campaignId: string,
    assetIds: readonly string[],
  ): Promise<ReadonlyMap<string, AssetPo['sightOutline']>> {
    if (assetIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: assets.id, sightOutline: assets.sightOutline })
      .from(assets)
      .where(and(eq(assets.campaignId, campaignId), inArray(assets.id, [...assetIds])));
    return new Map(rows.map((row) => [row.id, row.sightOutline]));
  }

  /** Every PNG asset of every campaign, oldest first: only `pnpm db:recompress-images` walks the
   *  whole table, never a request.
   *
   *  Example: `(await dao.listPngImages()).map((row) => row.storageKey)` */
  async listPngImages(): Promise<AssetPo[]> {
    return this.db
      .select()
      .from(assets)
      .where(eq(assets.mimeType, 'image/png'))
      .orderBy(asc(assets.createdAt), asc(assets.id));
  }

  /** Points the row at the file re-encoded under the same key, in one statement. */
  async updateKeptImage(assetId: string, kept: KeptImageColumns): Promise<void> {
    await this.db.update(assets).set(kept).where(eq(assets.id, assetId));
  }
}
