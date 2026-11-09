import {
  libraryMapDetailDto,
  mapRegionDto,
  type LibraryMapDetailDto,
  type LibraryMapSummaryDto,
  type MapRegionDto,
} from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { AssetsDao } from '../../src/modules/assets/assets.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { DocumentsDao } from '../../src/modules/documents/documents.dao';
import { libraryDocuments } from '../../src/modules/documents/documents.po';
import { ImagePresentationsDao } from '../../src/modules/library/image-presentations.dao';
import { LibraryImagesDao } from '../../src/modules/library/library-images.dao';
import { LibraryMapRegionsDao } from '../../src/modules/library-maps/library-map-regions.dao';
import { scenes } from '../../src/modules/scenes/scenes.po';
import { newAssetPo } from './assets-factories';
import { KINGDOM_GEOMETRY, newMapRegionPo } from './library-maps-factories';
import type { SignedInUser } from './sign-in';
import type { Table } from './tables';
import type { TokenTableHarness } from './token-table';

type Visibility = 'public' | 'private';

export const NEW_REGION = {
  name: 'Reino',
  geometry: KINGDOM_GEOMETRY,
  color: '#aa3300',
} as const;

/** The region, map and document routes of one table, through the real HTTP edge, plus the rows the
 *  routes have no way of creating here.
 *
 *  Example: `const atlas = new MapRegionsOverHttp(live); await atlas.addRegion(map.id)` */
export class MapRegionsOverHttp {
  constructor(private readonly live: TokenTableHarness) {}

  mapsUrl(table: Table = this.live.vharn): string {
    return `/api/campaigns/${table.id}/library-maps`;
  }

  regionsUrl(mapId: string, table: Table = this.live.vharn): string {
    return `${this.mapsUrl(table)}/${mapId}/regions`;
  }

  regionUrl(mapId: string, regionId: string, table: Table = this.live.vharn): string {
    return `${this.regionsUrl(mapId, table)}/${regionId}`;
  }

  /** Example: `const mundo = await atlas.createMap({ visibility: 'public' })` */
  async createMap(
    overrides: object = {},
    table: Table = this.live.vharn,
  ): Promise<LibraryMapSummaryDto> {
    const payload = {
      name: 'Mundo',
      assetId: await this.assetOf(table, 'library_map'),
      ...overrides,
    };
    const user = table.master;
    const response = await this.live.http(user, {
      method: 'POST',
      url: this.mapsUrl(table),
      payload,
    });
    if (response.statusCode !== 201) throw new Error(`createMap answered ${response.body}`);
    return response.json<LibraryMapSummaryDto>();
  }

  /** Ana's POST of a region, as is; the spec asserts the status.
   *
   *  Example: `await atlas.postRegion(map.id, { ...NEW_REGION, hidden: true })` */
  postRegion(
    mapId: string,
    payload: object = NEW_REGION,
    user: SignedInUser = this.live.ana,
  ): Promise<LightMyRequestResponse> {
    return this.live.http(user, { method: 'POST', url: this.regionsUrl(mapId), payload });
  }

  /** Example: `const reino = await atlas.addRegion(map.id, { hidden: true })` */
  async addRegion(mapId: string, overrides: object = {}): Promise<MapRegionDto> {
    const response = await this.postRegion(mapId, { ...NEW_REGION, ...overrides });
    if (response.statusCode !== 201) throw new Error(`addRegion answered ${response.body}`);
    return mapRegionDto.parse(response.json());
  }

  patchRegion(
    mapId: string,
    regionId: string,
    payload: object,
    user: SignedInUser = this.live.ana,
  ): Promise<LightMyRequestResponse> {
    const url = this.regionUrl(mapId, regionId);
    return this.live.http(user, { method: 'PATCH', url, payload });
  }

  readMap(user: SignedInUser, mapId: string): Promise<LightMyRequestResponse> {
    return this.live.http(user, { method: 'GET', url: `${this.mapsUrl()}/${mapId}` });
  }

  async detailOf(user: SignedInUser, mapId: string): Promise<LibraryMapDetailDto> {
    const response = await this.readMap(user, mapId);
    if (response.statusCode !== 200) throw new Error(`detail answered ${response.body}`);
    return libraryMapDetailDto.parse(response.json());
  }

  /** Example: `const diarioId = await atlas.documentId('Diário', 'private')` */
  async documentId(
    name: string,
    visibility: Visibility,
    table: Table = this.live.vharn,
  ): Promise<string> {
    const row = { campaignId: table.id, name, visibility };
    const [saved] = await this.db().insert(libraryDocuments).values(row).returning();
    if (!saved) throw new Error(`document ${name} was not inserted`);
    return saved.id;
  }

  /** Example: `await atlas.deleteDocument(diarioId)` */
  async deleteDocument(documentId: string): Promise<void> {
    await this.db().delete(libraryDocuments).where(eq(libraryDocuments.id, documentId));
  }

  async makeOwner(documentId: string, user: SignedInUser): Promise<void> {
    await new DocumentsDao(this.db()).replaceOwners(this.live.vharn.id, documentId, [user.id]);
  }

  /** Example: `const salaoId = await atlas.sceneId('Salão', 'private')` */
  async sceneId(
    name: string,
    visibility: Visibility,
    table: Table = this.live.vharn,
  ): Promise<string> {
    const row = { campaignId: table.id, name, visibility };
    const [saved] = await this.db().insert(scenes).values(row).returning();
    if (!saved) throw new Error(`scene ${name} was not inserted`);
    return saved.id;
  }

  async makeGroupScene(sceneId: string): Promise<void> {
    await new CampaignsDao(this.db()).setActiveScene(this.live.vharn.id, sceneId);
  }

  /** Example: `const brasaoId = await atlas.imageId('Brasão', 'private')` */
  async imageId(
    name: string,
    visibility: Visibility,
    table: Table = this.live.vharn,
  ): Promise<string> {
    const assetId = await this.assetOf(table, 'library_image');
    const row = { campaignId: table.id, assetId, name, visibility };
    return (await new LibraryImagesDao(this.db()).insert(row)).id;
  }

  async presentImage(imageId: string): Promise<void> {
    const change = {
      presentationId: crypto.randomUUID(),
      imageId,
      nameAtPresentation: 'Brasão',
    };
    await new ImagePresentationsDao(this.db()).save(this.live.vharn.id, change, new Date());
  }

  /** Straight to the table, because reaching the cap one POST at a time is only slow.
   *
   *  Example: `await atlas.fillRegions(map.id, 299)` */
  async fillRegions(mapId: string, count: number): Promise<void> {
    const dao = new LibraryMapRegionsDao(this.db());
    const row = newMapRegionPo({ campaignId: this.live.vharn.id, mapId });
    for (let index = 0; index < count; index += 1) await dao.insert(row);
  }

  private async assetOf(table: Table, purpose: 'library_map' | 'library_image'): Promise<string> {
    const row = newAssetPo({ campaignId: table.id, purpose });
    return (await new AssetsDao(this.db()).insert(row)).id;
  }

  private db(): TokenTableHarness['connection']['db'] {
    return this.live.connection.db;
  }
}
