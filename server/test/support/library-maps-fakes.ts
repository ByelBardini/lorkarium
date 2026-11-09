import type {
  LibraryChangedDto,
  LibraryMapChangedDto,
  LibraryMapRegionShownDto,
} from '@lorkarium/contracts';
import type {
  MapRegionChangesPo,
  MapRegionPo,
  NewMapRegionPo,
} from '../../src/modules/library-maps/library-map-regions.po';
import type { MapAppearanceRow } from '../../src/modules/library-maps/library-map-regions.dao';
import type {
  DocumentLinkTarget,
  DocumentTabLinkTarget,
  ImageLinkTarget,
  MapLinkTarget,
  SceneLinkTarget,
} from '../../src/modules/library-maps/map-region-projection.bo';
import type {
  LibraryMapReachPo,
  LibraryMapRow,
} from '../../src/modules/library-maps/library-maps.dao';
import type {
  LibraryMapChangesPo,
  LibraryMapPo,
  NewLibraryMapPo,
} from '../../src/modules/library-maps/library-maps.po';
import type {
  LibraryMapDaos,
  LibraryMapServiceDeps,
} from '../../src/modules/library-maps/library-maps.service';
import { AssetsDaoFake } from './assets-fakes';
import { ClockFake } from './auth-fakes';
import { ANA_ID } from './auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from './campaigns-fakes';
import { DocumentsDaoFake } from './documents-fakes';
import { BIA_ID, VHARN_ID, campaignMemberPo, campaignPo } from './campaigns-factories';
import { LibraryCampaignsDaoFake, SceneFoldersDaoFake } from './library-fakes';
import { MAP_ART_ID, libraryMapRow, mapRegionPo } from './library-maps-factories';

type MapDao = LibraryMapDaos['maps'];
type RegionDao = LibraryMapDaos['regions'];
type LinkTargetsDao = LibraryMapDaos['linkTargets'];
type InCampaign = Readonly<{ campaignId: string; id: string }>;

const inCampaign = <Row extends InCampaign>(
  rows: readonly Row[],
  campaignId: string,
  ids: readonly string[],
): Row[] => rows.filter((row) => row.campaignId === campaignId && ids.includes(row.id));

/** The items a region can point at, in any campaign; `lookups` keeps one entry per query. */
export class MapLinkTargetsDaoFake implements LinkTargetsDao {
  readonly lookups: string[] = [];
  readonly documents: (DocumentLinkTarget & InCampaign)[] = [];
  readonly documentTabs: (DocumentTabLinkTarget & InCampaign)[] = [];
  readonly scenes: (SceneLinkTarget & InCampaign)[] = [];
  readonly maps: (MapLinkTarget & InCampaign)[] = [];
  readonly images: (ImageLinkTarget & InCampaign)[] = [];

  async documentsIn(campaignId: string, ids: readonly string[]) {
    return this.lookup('documents', inCampaign(this.documents, campaignId, ids), ids);
  }

  async documentTabsIn(campaignId: string, ids: readonly string[]) {
    return this.lookup('documentTabs', inCampaign(this.documentTabs, campaignId, ids), ids);
  }

  async scenesIn(campaignId: string, ids: readonly string[]) {
    return this.lookup('scenes', inCampaign(this.scenes, campaignId, ids), ids);
  }

  async mapsIn(campaignId: string, ids: readonly string[]) {
    return this.lookup('maps', inCampaign(this.maps, campaignId, ids), ids);
  }

  async imagesIn(campaignId: string, ids: readonly string[]) {
    return this.lookup('images', inCampaign(this.images, campaignId, ids), ids);
  }

  private lookup<Row>(table: string, rows: Row[], ids: readonly string[]): Row[] {
    if (ids.length > 0) this.lookups.push(table);
    return rows;
  }
}

/** A row of "Aparece em", kept with the document it answers for. */
export type MapAppearanceFixture = MapAppearanceRow &
  Readonly<{ campaignId: string; documentId: string }>;

/** In-memory regions of every map; each write records its name in the journal. */
export class LibraryMapRegionsDaoFake implements RegionDao {
  readonly rows: MapRegionPo[] = [];
  readonly appearances: MapAppearanceFixture[] = [];
  failSave = false;

  constructor(private readonly journal: string[]) {}

  async insert(input: NewMapRegionPo): Promise<MapRegionPo> {
    if (this.failSave) throw new Error('save failed');
    this.journal.push('region:insert');
    const id = `7a7a7a7a-7a7a-4a7a-8a7a-${String(this.rows.length + 1).padStart(12, '0')}`;
    const row = mapRegionPo({ id, ...input });
    this.rows.push(row);
    return row;
  }

  async listOfMap(campaignId: string, mapId: string): Promise<MapRegionPo[]> {
    return this.rows.filter((row) => row.campaignId === campaignId && row.mapId === mapId);
  }

  async findInMap(
    campaignId: string,
    mapId: string,
    regionId: string,
  ): Promise<MapRegionPo | undefined> {
    return (await this.listOfMap(campaignId, mapId)).find((row) => row.id === regionId);
  }

  async countOfMap(campaignId: string, mapId: string): Promise<number> {
    return (await this.listOfMap(campaignId, mapId)).length;
  }

  async update(
    campaignId: string,
    mapId: string,
    regionId: string,
    changes: MapRegionChangesPo,
  ): Promise<MapRegionPo | undefined> {
    const row = await this.findInMap(campaignId, mapId, regionId);
    if (!row) return undefined;
    this.journal.push('region:update');
    return Object.assign(row, changes);
  }

  async delete(campaignId: string, mapId: string, regionId: string): Promise<boolean> {
    const row = await this.findInMap(campaignId, mapId, regionId);
    if (!row) return false;
    this.journal.push('region:delete');
    this.rows.splice(this.rows.indexOf(row), 1);
    return true;
  }

  async listAppearances(campaignId: string, documentId: string): Promise<MapAppearanceRow[]> {
    const same = (row: MapAppearanceFixture) =>
      row.campaignId === campaignId && row.documentId === documentId;
    return this.appearances.filter(same);
  }
}

/** In-memory maps of every campaign; each write records its name in the journal. */
export class LibraryMapsDaoFake implements MapDao {
  readonly rows: LibraryMapRow[] = [];
  failSave = false;

  constructor(private readonly journal: string[]) {}

  async insert(input: NewLibraryMapPo): Promise<LibraryMapPo> {
    if (this.failSave) throw new Error('save failed');
    this.journal.push('insert');
    const id = `5a5a5a5a-5a5a-4a5a-8a5a-${String(this.rows.length + 1).padStart(12, '0')}`;
    const row = libraryMapRow({ id, ...input });
    this.rows.push(row);
    return row.map;
  }

  async findInCampaign(campaignId: string, mapId: string): Promise<LibraryMapRow | undefined> {
    return this.rows.find((row) => row.map.campaignId === campaignId && row.map.id === mapId);
  }

  async findMainOfCampaign(campaignId: string): Promise<LibraryMapRow | undefined> {
    return this.rows.find((row) => row.map.campaignId === campaignId && row.map.isMain);
  }

  async findByAsset(campaignId: string, assetId: string): Promise<LibraryMapReachPo | undefined> {
    const same = (row: LibraryMapRow) =>
      row.map.campaignId === campaignId && row.map.assetId === assetId;
    return this.rows.find(same)?.map;
  }

  async update(
    campaignId: string,
    mapId: string,
    changes: LibraryMapChangesPo,
  ): Promise<LibraryMapPo | undefined> {
    this.journal.push('update');
    const row = await this.findInCampaign(campaignId, mapId);
    return row && Object.assign(row.map, changes);
  }

  async bumpVersion(campaignId: string, mapId: string): Promise<number | undefined> {
    this.journal.push('bump');
    const row = await this.findInCampaign(campaignId, mapId);
    if (row) row.map.version += 1;
    return row?.map.version;
  }

  async setMain(campaignId: string, mapId: string): Promise<boolean> {
    if (this.failSave) throw new Error('save failed');
    this.journal.push('set');
    const row = await this.findInCampaign(campaignId, mapId);
    if (row) row.map.isMain = true;
    return row !== undefined;
  }

  async clearMain(campaignId: string): Promise<void> {
    this.journal.push('unset');
    const row = await this.findMainOfCampaign(campaignId);
    if (row) row.map.isMain = false;
  }

  async delete(campaignId: string, mapId: string): Promise<boolean> {
    this.journal.push('delete');
    const index = this.rows.findIndex(
      (row) => row.map.campaignId === campaignId && row.map.id === mapId,
    );
    if (index >= 0) this.rows.splice(index, 1);
    return index >= 0;
  }
}

export const SHOW_EVENT_ID = '8c8c8c8c-8c8c-4c8c-8c8c-8c8c8c8c8c8c';

/** The service over fakes, with Ana (master) and Bia (player) at Vharn; `journal` keeps the order
 *  of locks, writes, commits and publications.
 *
 *  Example: `const h = new LibraryMapsHarness(); await new LibraryMapsService(h.deps).main(req)` */
export class LibraryMapsHarness {
  readonly journal: string[] = [];
  readonly maps = new LibraryMapsDaoFake(this.journal);
  readonly regions = new LibraryMapRegionsDaoFake(this.journal);
  readonly linkTargets = new MapLinkTargetsDaoFake();
  readonly documents = new DocumentsDaoFake(this.journal);
  readonly campaigns = new LibraryCampaignsDaoFake(this.journal, [campaignPo({ id: VHARN_ID })]);
  readonly folders = new SceneFoldersDaoFake(this.journal);
  readonly events: LibraryChangedDto[] = [];
  readonly mapChanges: LibraryMapChangedDto[] = [];
  readonly regionsShown: LibraryMapRegionShownDto[] = [];
  readonly assets = new AssetsDaoFake([], [libraryMapRow({ assetId: MAP_ART_ID }).asset]);
  readonly members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
    campaignMemberPo({ userId: ANA_ID, role: 'master', campaignId: VHARN_ID }),
    campaignMemberPo({ userId: BIA_ID, role: 'player', campaignId: VHARN_ID }),
  ]);
  readonly daos: LibraryMapDaos = {
    campaigns: this.campaigns,
    members: this.members,
    assets: this.assets,
    folders: this.folders,
    maps: this.maps,
    regions: this.regions,
    linkTargets: this.linkTargets,
    documents: this.documents,
  };
  readonly deps: LibraryMapServiceDeps = {
    read: this.daos,
    transaction: async (work) => {
      const result = await work(this.daos);
      this.journal.push('commit');
      return result;
    },
    snapshot: (work) => work(this.daos),
    clock: new ClockFake(new Date('2026-11-09T15:00:00Z')),
    publisher: {
      libraryChanged: (event) => {
        this.journal.push('publish');
        this.events.push(event);
      },
      libraryMapChanged: (event) => {
        this.journal.push('publish');
        this.mapChanges.push(event);
      },
      mapRegionShown: (event) => {
        this.journal.push('publish');
        this.regionsShown.push(event);
      },
    },
    newId: () => SHOW_EVENT_ID,
    maxFolderDepth: 5,
  };
}
