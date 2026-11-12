import { and, count, eq, getTableColumns, sql, type SQL } from 'drizzle-orm';
import { hiddenByFolderSql } from '../../database/hidden-by-folder-sql';
import type { DatabaseExecutor } from '../../database/transaction';
import { assets, type AssetPo } from '../assets/assets.po';
import {
  libraryMaps,
  type LibraryMapChangesPo,
  type LibraryMapPo,
  type NewLibraryMapPo,
} from './library-maps.po';

/** A map as its gates read it: the row and whether a private folder above it hides it. */
export type LibraryMapReachPo = LibraryMapPo & Readonly<{ hiddenByFolder: boolean }>;
export type LibraryMapRow = Readonly<{ map: LibraryMapReachPo; asset: AssetPo }>;
/** A map as the library lists it, before its folder chain is decided. */
export type LibraryMapListedRow = Readonly<{ map: LibraryMapPo; asset: AssetPo }>;
const MAP_WITH_FOLDER = {
  ...getTableColumns(libraryMaps),
  hiddenByFolder: hiddenByFolderSql('"library_maps"."folder_id"'),
};

const MAP_ASSET = and(
  eq(assets.id, libraryMaps.assetId),
  eq(assets.campaignId, libraryMaps.campaignId),
);

/** Every query filters by the campaign of the session: an id of another campaign finds, changes
 *  and deletes nothing. Receives the `db` or an open `tx`.
 *
 *  Example: `const mapsDao = new LibraryMapsDao(tx)` */
export class LibraryMapsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Example: `await mapsDao.insert({ campaignId, assetId, name: 'Mundo' })` */
  async insert(row: NewLibraryMapPo): Promise<LibraryMapPo> {
    const [saved] = await this.db.insert(libraryMaps).values(row).returning();
    if (!saved) throw new Error(`No library map inserted for asset ${row.assetId}`);
    return saved;
  }

  /** The maps of the campaign with their images, in creation order, without the folder chain
   *  (the library decides it over the folders it already read).
   *
   *  Example: `await mapsDao.listOfCampaign(campaignId)` */
  async listOfCampaign(campaignId: string): Promise<LibraryMapListedRow[]> {
    return this.db
      .select({ map: libraryMaps, asset: assets })
      .from(libraryMaps)
      .innerJoin(assets, MAP_ASSET)
      .where(eq(libraryMaps.campaignId, campaignId))
      .orderBy(libraryMaps.createdAt, libraryMaps.id);
  }

  /** How many maps the campaign has, what its owner's plan counts (`libraryMaps`).
   *
   *  Example: `await mapsDao.countOfCampaign(campaignId)` */
  async countOfCampaign(campaignId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(libraryMaps)
      .where(eq(libraryMaps.campaignId, campaignId));
    return row?.total ?? 0;
  }

  /** Example: `await mapsDao.findInCampaign(campaignId, mapId)` */
  async findInCampaign(campaignId: string, mapId: string): Promise<LibraryMapRow | undefined> {
    const [row] = await this.rowsWhere(this.oneMap(campaignId, mapId));
    return row;
  }

  /** Example: `await mapsDao.findMainOfCampaign(campaignId)` */
  async findMainOfCampaign(campaignId: string): Promise<LibraryMapRow | undefined> {
    const [row] = await this.rowsWhere(
      and(eq(libraryMaps.campaignId, campaignId), eq(libraryMaps.isMain, true)),
    );
    return row;
  }

  /** The map that uses an image, which is what deciding who reads its bytes starts from.
   *
   *  Example: `await mapsDao.findByAsset(campaignId, assetId)` */
  async findByAsset(campaignId: string, assetId: string): Promise<LibraryMapReachPo | undefined> {
    const [row] = await this.db
      .select(MAP_WITH_FOLDER)
      .from(libraryMaps)
      .where(and(eq(libraryMaps.campaignId, campaignId), eq(libraryMaps.assetId, assetId)));
    return row;
  }

  /** Saves only the keys received; `undefined` when the map is not of the campaign.
   *
   *  Example: `await mapsDao.update(campaignId, mapId, { folderId: null })` */
  async update(
    campaignId: string,
    mapId: string,
    changes: LibraryMapChangesPo,
  ): Promise<LibraryMapPo | undefined> {
    const [saved] = await this.db
      .update(libraryMaps)
      .set({ ...changes, updatedAt: sql`now()` })
      .where(this.oneMap(campaignId, mapId))
      .returning();
    return saved;
  }

  /** Adds one to the version and returns it; `undefined` when the map is not of the campaign.
   *
   *  Example: `const version = await mapsDao.bumpVersion(campaignId, mapId)` */
  async bumpVersion(campaignId: string, mapId: string): Promise<number | undefined> {
    const [saved] = await this.db
      .update(libraryMaps)
      .set({ version: sql`${libraryMaps.version} + 1`, updatedAt: sql`now()` })
      .where(this.oneMap(campaignId, mapId))
      .returning({ version: libraryMaps.version });
    return saved?.version;
  }

  /** Marks the map as main. Call `clearMain` first in the same transaction: the unique index is
   *  checked at each statement, so the old main map cannot still be there.
   *
   *  Example: `await mapsDao.setMain(campaignId, mapId)` */
  async setMain(campaignId: string, mapId: string): Promise<boolean> {
    return this.markMain(this.oneMap(campaignId, mapId), true);
  }

  /** Leaves the campaign without a main map.
   *
   *  Example: `await mapsDao.clearMain(campaignId)` */
  async clearMain(campaignId: string): Promise<void> {
    await this.markMain(
      and(eq(libraryMaps.campaignId, campaignId), eq(libraryMaps.isMain, true)),
      false,
    );
  }

  /** Example: `await mapsDao.delete(campaignId, mapId)` */
  async delete(campaignId: string, mapId: string): Promise<boolean> {
    const removed = await this.db
      .delete(libraryMaps)
      .where(this.oneMap(campaignId, mapId))
      .returning({ id: libraryMaps.id });
    return removed.length > 0;
  }

  /** Takes the maps of a folder about to be deleted to its parent (the database would take them
   *  to the root).
   *
   *  Example: `await mapsDao.moveFromFolder(campaignId, folderId, parentId)` */
  async moveFromFolder(
    campaignId: string,
    folderId: string,
    parentId: string | null,
  ): Promise<void> {
    await this.db
      .update(libraryMaps)
      .set({ folderId: parentId })
      .where(and(eq(libraryMaps.campaignId, campaignId), eq(libraryMaps.folderId, folderId)));
  }

  private oneMap(campaignId: string, mapId: string): SQL | undefined {
    return and(eq(libraryMaps.campaignId, campaignId), eq(libraryMaps.id, mapId));
  }

  private async rowsWhere(condition: SQL | undefined): Promise<LibraryMapRow[]> {
    return this.db
      .select({ map: MAP_WITH_FOLDER, asset: assets })
      .from(libraryMaps)
      .innerJoin(assets, MAP_ASSET)
      .where(condition)
      .orderBy(libraryMaps.createdAt, libraryMaps.id);
  }

  private async markMain(condition: SQL | undefined, isMain: boolean): Promise<boolean> {
    const marked = await this.db
      .update(libraryMaps)
      .set({ isMain, updatedAt: sql`now()` })
      .where(condition)
      .returning({ id: libraryMaps.id });
    return marked.length > 0;
  }
}
