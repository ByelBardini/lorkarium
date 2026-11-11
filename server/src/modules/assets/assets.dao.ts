import { and, eq, getTableColumns, inArray } from 'drizzle-orm';
import { columnsWithout } from '../../database/columns-without';
import type { DatabaseExecutor } from '../../database/transaction';
import { assets, type AssetPo, type NewAssetPo } from './assets.po';

/** An asset row without its silhouette, which can be large. */
export type AssetHeaderPo = Omit<AssetPo, 'sightOutline'>;

const ASSET_HEADER = columnsWithout(getTableColumns(assets), 'sightOutline');

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

  /** `findById` without the silhouette, which can be large: what serving the bytes reads. */
  async findHeaderById(assetId: string): Promise<AssetHeaderPo | undefined> {
    const [row] = await this.db.select(ASSET_HEADER).from(assets).where(eq(assets.id, assetId));
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
}
