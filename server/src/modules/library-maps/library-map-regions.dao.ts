import { and, count, eq, sql, type SQL } from 'drizzle-orm';
import { hiddenByFolderSql } from '../../database/hidden-by-folder-sql';
import type { DatabaseExecutor } from '../../database/transaction';
import { libraryDocumentTabs, type DocumentTabPo } from '../documents/document-tabs.po';
import {
  libraryMapRegions,
  type MapRegionChangesPo,
  type MapRegionPo,
  type NewMapRegionPo,
} from './library-map-regions.po';
import { libraryMaps, type LibraryMapPo } from './library-maps.po';

/** A place where a document appears, with what decides whether each reader may know of it. */
export type MapAppearanceRow = Readonly<{
  mapId: string;
  mapName: string;
  mapVisibility: LibraryMapPo['visibility'];
  mapIsMain: boolean;
  mapHiddenByFolder: boolean;
  regionId: string;
  regionName: string;
  regionHidden: boolean;
  tabName: string | null;
  tabVisibility: DocumentTabPo['visibility'] | null;
}>;

/** Every query filters by the campaign of the session and, for one region, by its map too: the
 *  address in the URL has to be the real one. Receives the `db` or an open `tx`.
 *
 *  Example: `const regionsDao = new LibraryMapRegionsDao(tx)` */
export class LibraryMapRegionsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Example: `await regionsDao.insert({ campaignId, mapId, name, geometry, color })` */
  async insert(row: NewMapRegionPo): Promise<MapRegionPo> {
    const [saved] = await this.db.insert(libraryMapRegions).values(row).returning();
    if (!saved) throw new Error(`No map region inserted on map ${row.mapId}`);
    return saved;
  }

  /** The regions of the map in creation order; which of them a reader gets is the caller's.
   *
   *  Example: `await regionsDao.listOfMap(campaignId, mapId)` */
  async listOfMap(campaignId: string, mapId: string): Promise<MapRegionPo[]> {
    return this.db
      .select()
      .from(libraryMapRegions)
      .where(this.ofMap(campaignId, mapId))
      .orderBy(libraryMapRegions.createdAt, libraryMapRegions.id);
  }

  /** Example: `await regionsDao.findInMap(campaignId, mapId, regionId)` */
  async findInMap(
    campaignId: string,
    mapId: string,
    regionId: string,
  ): Promise<MapRegionPo | undefined> {
    const [row] = await this.db
      .select()
      .from(libraryMapRegions)
      .where(this.oneRegion(campaignId, mapId, regionId));
    return row;
  }

  /** Example: `await regionsDao.countOfMap(campaignId, mapId)` */
  async countOfMap(campaignId: string, mapId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(libraryMapRegions)
      .where(this.ofMap(campaignId, mapId));
    return row?.total ?? 0;
  }

  /** Saves only the keys received; `undefined` when the region is not at that address.
   *
   *  Example: `await regionsDao.update(campaignId, mapId, regionId, { hidden: true })` */
  async update(
    campaignId: string,
    mapId: string,
    regionId: string,
    changes: MapRegionChangesPo,
  ): Promise<MapRegionPo | undefined> {
    const [saved] = await this.db
      .update(libraryMapRegions)
      .set({ ...changes, updatedAt: sql`now()` })
      .where(this.oneRegion(campaignId, mapId, regionId))
      .returning();
    return saved;
  }

  /** Example: `await regionsDao.delete(campaignId, mapId, regionId)` */
  async delete(campaignId: string, mapId: string, regionId: string): Promise<boolean> {
    const removed = await this.db
      .delete(libraryMapRegions)
      .where(this.oneRegion(campaignId, mapId, regionId))
      .returning({ id: libraryMapRegions.id });
    return removed.length > 0;
  }

  /** Every region linked to a document, map by map; hidden ones and private maps come too, so the
   *  caller filters them by who is reading.
   *
   *  Example: `await regionsDao.listAppearances(campaignId, documentId)` */
  async listAppearances(campaignId: string, documentId: string): Promise<MapAppearanceRow[]> {
    return this.db
      .select({
        mapId: libraryMaps.id,
        mapName: libraryMaps.name,
        mapVisibility: libraryMaps.visibility,
        mapIsMain: libraryMaps.isMain,
        mapHiddenByFolder: hiddenByFolderSql('"library_maps"."folder_id"'),
        regionId: libraryMapRegions.id,
        regionName: libraryMapRegions.name,
        regionHidden: libraryMapRegions.hidden,
        tabName: libraryDocumentTabs.name,
        tabVisibility: libraryDocumentTabs.visibility,
      })
      .from(libraryMapRegions)
      .innerJoin(
        libraryMaps,
        and(
          eq(libraryMaps.id, libraryMapRegions.mapId),
          eq(libraryMaps.campaignId, libraryMapRegions.campaignId),
        ),
      )
      .leftJoin(
        libraryDocumentTabs,
        and(
          eq(libraryDocumentTabs.id, libraryMapRegions.targetDocumentTabId),
          eq(libraryDocumentTabs.campaignId, libraryMapRegions.campaignId),
        ),
      )
      .where(
        and(
          eq(libraryMapRegions.campaignId, campaignId),
          eq(libraryMapRegions.targetDocumentId, documentId),
        ),
      )
      .orderBy(
        libraryMaps.createdAt,
        libraryMaps.id,
        libraryMapRegions.createdAt,
        libraryMapRegions.id,
      );
  }

  private ofMap(campaignId: string, mapId: string): SQL | undefined {
    return and(eq(libraryMapRegions.campaignId, campaignId), eq(libraryMapRegions.mapId, mapId));
  }

  private oneRegion(campaignId: string, mapId: string, regionId: string): SQL | undefined {
    return and(this.ofMap(campaignId, mapId), eq(libraryMapRegions.id, regionId));
  }
}
