import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { AssetsDao } from '../../src/modules/assets/assets.dao';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { libraryDocuments } from '../../src/modules/documents/documents.po';
import { LibraryImagesDao } from '../../src/modules/library/library-images.dao';
import { SceneFoldersDao } from '../../src/modules/library/scene-folders.dao';
import { LibraryMapRegionsDao } from '../../src/modules/library-maps/library-map-regions.dao';
import {
  libraryMapRegions,
  type MapRegionPo,
} from '../../src/modules/library-maps/library-map-regions.po';
import { LibraryMapsDao } from '../../src/modules/library-maps/library-maps.dao';
import type { LibraryMapPo } from '../../src/modules/library-maps/library-maps.po';
import { scenes } from '../../src/modules/scenes/scenes.po';
import { newAssetPo } from './assets-factories';
import { newUserPo } from './auth-factories';
import { newCampaignPo } from './campaigns-factories';
import { newLibraryMapPo, newMapRegionPo } from './library-maps-factories';
import { openTestDatabase, truncateAllTables } from './test-database';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

/** One campaign with one of each thing a map can point at; `otherMapId` is a map called "Masmorra". */
export type FurnishedCampaign = Readonly<{
  campaignId: string;
  folderId: string;
  sceneId: string;
  documentId: string;
  imageId: string;
  otherMapId: string;
}>;

/** Two furnished campaigns (Vharn and Quelm) on Postgres, with no HTTP app. Fields are set by the
 *  hooks `useLibraryMapsTable` registers, so read them inside an `it`. */
export class LibraryMapsTableHarness {
  connection!: DatabaseConnection;
  maps!: LibraryMapsDao;
  regions!: LibraryMapRegionsDao;
  vharn!: FurnishedCampaign;
  quelm!: FurnishedCampaign;

  async open(): Promise<void> {
    this.connection = await openTestDatabase();
    this.maps = new LibraryMapsDao(this.connection.db);
    this.regions = new LibraryMapRegionsDao(this.connection.db);
  }

  async seed(): Promise<void> {
    const db = this.connection.db;
    await truncateAllTables(db);
    const ownerId = (await new UsersDao(db).insert(newUserPo())).id;
    const campaignsDao = new CampaignsDao(db);
    const vharnId = (await campaignsDao.insert(newCampaignPo({ ownerId }))).id;
    const quelm = newCampaignPo({ ownerId, name: 'Quelm', joinCode: 'QELM2345' });
    this.vharn = await this.furnish(vharnId);
    this.quelm = await this.furnish((await campaignsDao.insert(quelm)).id);
  }

  /** A stored image for a map of `campaignId`.
   *
   *  Example: `const assetId = await live.assetIdOf(live.quelm.campaignId)` */
  async assetIdOf(campaignId: string): Promise<string> {
    const assets = new AssetsDao(this.connection.db);
    return (await assets.insert(newAssetPo({ campaignId, purpose: 'library_map' }))).id;
  }

  /** Example: `const mundo = await live.createMap(live.vharn, { isMain: true })` */
  async createMap(
    table: FurnishedCampaign,
    overrides: Partial<LibraryMapPo> = {},
  ): Promise<LibraryMapPo> {
    const assetId = await this.assetIdOf(table.campaignId);
    const row = newLibraryMapPo({ campaignId: table.campaignId, assetId, ...overrides });
    return this.maps.insert(row);
  }

  /** Example: `await live.createRegion(live.vharn, mundo.id, { hidden: true })` */
  createRegion(
    table: FurnishedCampaign,
    mapId: string,
    overrides: Partial<MapRegionPo> = {},
  ): Promise<MapRegionPo> {
    const row = newMapRegionPo({ campaignId: table.campaignId, mapId, ...overrides });
    return this.regions.insert(row);
  }

  /** The row as it is on the table, whatever campaign or map it belongs to.
   *
   *  Example: `expect(await live.storedRegion(reino.id)).toBeUndefined()` */
  async storedRegion(regionId: string): Promise<MapRegionPo | undefined> {
    const [row] = await this.connection.db
      .select()
      .from(libraryMapRegions)
      .where(eq(libraryMapRegions.id, regionId));
    return row;
  }

  private async furnish(campaignId: string): Promise<FurnishedCampaign> {
    const db = this.connection.db;
    const folder = await new SceneFoldersDao(db).insert({ campaignId, name: 'Atlas' });
    const [scene] = await db.insert(scenes).values({ campaignId, name: 'Salão' }).returning();
    const [document] = await db
      .insert(libraryDocuments)
      .values({ campaignId, name: 'Diário' })
      .returning();
    const imageRow = { campaignId, assetId: await this.assetIdOf(campaignId), name: 'Brasão' };
    const image = await new LibraryImagesDao(db).insert(imageRow);
    return {
      campaignId,
      folderId: folder.id,
      sceneId: scene?.id ?? MISSING_ID,
      documentId: document?.id ?? MISSING_ID,
      imageId: image.id,
      otherMapId: (await this.insertOtherMap(campaignId)).id,
    };
  }

  private async insertOtherMap(campaignId: string): Promise<LibraryMapPo> {
    const assetId = await this.assetIdOf(campaignId);
    return this.maps.insert(newLibraryMapPo({ campaignId, assetId, name: 'Masmorra' }));
  }
}

/** Registers the hooks of a spec of the map tables and hands back the harness.
 *
 *  Example: `const live = useLibraryMapsTable(); it('…', () => live.createMap(live.vharn))` */
export function useLibraryMapsTable(): LibraryMapsTableHarness {
  const harness = new LibraryMapsTableHarness();
  beforeAll(() => harness.open());
  afterAll(() => harness.connection.close());
  beforeEach(() => harness.seed());
  return harness;
}
