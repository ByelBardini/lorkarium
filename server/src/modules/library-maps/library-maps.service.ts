import type {
  CreateLibraryMapRequestDto,
  LibraryMapDetailDto,
  LibraryMapSummaryDto,
  MainMapResponseDto,
  UpdateLibraryMapRequestDto,
} from '@lorkarium/contracts';
import type { AssetsDao } from '../assets/assets.dao';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { CampaignWithOwnerPo, CampaignsDao } from '../campaigns/campaigns.dao';
import { CampaignNotFoundError } from '../campaigns/campaigns.error';
import { viewerAccessOf } from '../campaigns/member-access';
import type { DocumentsDao } from '../documents/documents.dao';
import type { LibraryPublisherPort } from '../library/library-publisher.port';
import { PlanLimitsBo, effectiveLimitsOf } from '../plans/plan-limits.bo';
import type { LibraryRequester } from '../library/library.service';
import { SceneLibraryBo } from '../library/scene-library.bo';
import type { SceneFoldersDao } from '../library/scene-folders.dao';
import {
  LibraryMapAccessBo,
  requireFreeMapAsset,
  requireMapDeletable,
} from './library-map-access.bo';
import type { LibraryMapRegionsDao } from './library-map-regions.dao';
import type { LibraryMapRow, LibraryMapsDao } from './library-maps.dao';
import { LibraryMapNotFoundError } from './library-maps.error';
import { toLibraryMapDetailDto, toLibraryMapSummaryDto } from './library-maps.mapper';
import type { MapLinkTargetsDao } from './map-link-targets.dao';
import { readMapRegions } from './map-region-links.service';

export type LibraryMapDaos = Readonly<{
  campaigns: Pick<CampaignsDao, 'lockWithOwner' | 'findById'>;
  members: Pick<CampaignMembersDao, 'findMembership'>;
  assets: Pick<AssetsDao, 'findInCampaign'>;
  folders: Pick<SceneFoldersDao, 'listOfCampaign'>;
  maps: Pick<
    LibraryMapsDao,
    | 'countOfCampaign'
    | 'insert'
    | 'findInCampaign'
    | 'findMainOfCampaign'
    | 'findByAsset'
    | 'update'
    | 'bumpVersion'
    | 'setMain'
    | 'clearMain'
    | 'delete'
  >;
  regions: Pick<
    LibraryMapRegionsDao,
    'insert' | 'listOfMap' | 'findInMap' | 'countOfMap' | 'update' | 'delete' | 'listAppearances'
  >;
  linkTargets: Pick<
    MapLinkTargetsDao,
    'documentsIn' | 'documentTabsIn' | 'scenesIn' | 'mapsIn' | 'imagesIn'
  >;
  documents: Pick<DocumentsDao, 'findInCampaign' | 'owners'>;
}>;

export type LibraryMapTransaction = <T>(work: (daos: LibraryMapDaos) => Promise<T>) => Promise<T>;

export type LibraryMapServiceDeps = Readonly<{
  read: LibraryMapDaos;
  transaction: LibraryMapTransaction;
  snapshot: LibraryMapTransaction;
  clock: ClockPort;
  publisher: Pick<LibraryPublisherPort, 'libraryChanged' | 'libraryMapChanged' | 'mapRegionShown'>;
  newId: () => string;
  /** `SCENE_FOLDER_DEPTH_MAX`, passed by the plugin. */
  maxFolderDepth: number;
}>;

// The outcome of an edit that may find nothing to do: only a real change is announced.
type MainSwitch = Readonly<{ row: LibraryMapRow; changed: boolean }>;

/** The master's edit of the maps: refuses anyone else before locking, then runs the work with the
 *  campaign locked, in one transaction; the work gets the locked row with its owner's plan.
 *
 *  Example: `await editAsMaster(deps, requester, 'edit map', (daos, access) => save(daos, access))` */
export async function editAsMaster<T>(
  deps: Pick<LibraryMapServiceDeps, 'read' | 'transaction'>,
  requester: LibraryRequester,
  action: string,
  work: (
    daos: LibraryMapDaos,
    access: CampaignAccessBo,
    campaign: CampaignWithOwnerPo,
  ) => Promise<T>,
): Promise<T> {
  const { userId, campaignId } = requester;
  const access = await viewerAccessOf(deps.read.members, campaignId, userId);
  access.requireMaster(action);
  return deps.transaction(async (daos) => {
    const campaign = await daos.campaigns.lockWithOwner(campaignId);
    if (!campaign) throw new CampaignNotFoundError({ campaignId, userId });
    return work(daos, access, campaign);
  });
}

/** The map at this address, or LIBRARY_MAP_NOT_FOUND.
 *
 *  Example: `const { map } = await requireMapRow(daos, requester, mapId)` */
export async function requireMapRow(
  daos: LibraryMapDaos,
  requester: LibraryRequester,
  mapId: string,
): Promise<LibraryMapRow> {
  const row = await daos.maps.findInCampaign(requester.campaignId, mapId);
  if (row) return row;
  throw new LibraryMapNotFoundError(requester.campaignId, mapId, requester.userId);
}

/** The maps of the library. Every edit is the master's, runs with the campaign locked, commits,
 *  and only then tells the table `library:changed`, which carries nothing: each client reads back
 *  through a route that filters by role.
 *
 *  Example: `await maps.create({ userId, campaignId }, { name: 'Mundo', assetId })` */
export class LibraryMapsService {
  constructor(private readonly deps: LibraryMapServiceDeps) {}

  /** A new map, private unless said otherwise and never the main one.
   *
   *  Example: `await maps.create(requester, { name: 'Mundo', assetId })` */
  async create(
    requester: LibraryRequester,
    input: CreateLibraryMapRequestDto,
  ): Promise<LibraryMapSummaryDto> {
    const saved = await this.edit(requester, 'create a map', async (daos, campaign) => {
      const { campaignId } = requester;
      await this.requireMapRoom(daos, campaign);
      await this.requireFreeAsset(daos, campaignId, input.assetId);
      const folderId = input.folderId ?? null;
      await this.requireFolder(daos, campaignId, folderId);
      const visibility = input.visibility ?? 'private';
      const row = { campaignId, name: input.name, assetId: input.assetId, folderId, visibility };
      return requireMapRow(daos, requester, (await daos.maps.insert(row)).id);
    });
    this.announce(requester.campaignId);
    return toLibraryMapSummaryDto(saved);
  }

  /** The map as this reader may know it; one they may not see answers LIBRARY_MAP_NOT_FOUND.
   *
   *  Example: `(await maps.detail(requester, mapId)).regions` */
  async detail(requester: LibraryRequester, mapId: string): Promise<LibraryMapDetailDto> {
    return this.deps.snapshot(async (daos) => {
      const { userId, campaignId } = requester;
      const access = await viewerAccessOf(daos.members, campaignId, userId);
      const row = await requireMapRow(daos, requester, mapId);
      new LibraryMapAccessBo(access).requireSee(row.map);
      const regions = await daos.regions.listOfMap(campaignId, mapId);
      return toLibraryMapDetailDto(row, await readMapRegions(daos, access, regions));
    });
  }

  /** The main map of the table, which every member sees; `map: null` when there is none.
   *
   *  Example: `(await maps.main(requester)).map?.id` */
  async main(requester: LibraryRequester): Promise<MainMapResponseDto> {
    const { userId, campaignId } = requester;
    await viewerAccessOf(this.deps.read.members, campaignId, userId);
    const row = await this.deps.read.maps.findMainOfCampaign(campaignId);
    return { map: row ? toLibraryMapSummaryDto(row) : null };
  }

  /** Renames, moves or publishes/hides a map; an absent key stays. The version goes up because
   *  an open map only replaces what it shows by a higher one.
   *
   *  Example: `await maps.update(requester, mapId, { visibility: 'public' })` */
  async update(
    requester: LibraryRequester,
    mapId: string,
    changes: UpdateLibraryMapRequestDto,
  ): Promise<LibraryMapSummaryDto> {
    const saved = await this.edit(requester, `edit map ${mapId}`, async (daos) => {
      const { campaignId } = requester;
      if (changes.folderId !== undefined)
        await this.requireFolder(daos, campaignId, changes.folderId);
      if (!(await daos.maps.update(campaignId, mapId, changes)))
        throw new LibraryMapNotFoundError(campaignId, mapId, requester.userId);
      await daos.maps.bumpVersion(campaignId, mapId);
      return requireMapRow(daos, requester, mapId);
    });
    this.announce(requester.campaignId);
    return toLibraryMapSummaryDto(saved);
  }

  /** Deletes a map and its regions; never the main one (MAP_IS_MAIN).
   *
   *  Example: `await maps.delete(requester, mapId)` */
  async delete(requester: LibraryRequester, mapId: string): Promise<void> {
    await this.edit(requester, `delete map ${mapId}`, async (daos) => {
      requireMapDeletable((await requireMapRow(daos, requester, mapId)).map);
      await daos.maps.delete(requester.campaignId, mapId);
    });
    this.announce(requester.campaignId);
  }

  /** Makes this the main map, in place of the current one; the one that already is stays silent.
   *
   *  Example: `await maps.setMain(requester, mapId)` */
  async setMain(requester: LibraryRequester, mapId: string): Promise<LibraryMapSummaryDto> {
    return this.switchMain(requester, mapId, true, async (maps) => {
      await maps.clearMain(requester.campaignId);
      await maps.setMain(requester.campaignId, mapId);
    });
  }

  /** Leaves the table without a main map, if this is the one; the map goes back to its own
   *  visibility.
   *
   *  Example: `await maps.unsetMain(requester, mapId)` */
  async unsetMain(requester: LibraryRequester, mapId: string): Promise<LibraryMapSummaryDto> {
    return this.switchMain(requester, mapId, false, (maps) => maps.clearMain(requester.campaignId));
  }

  private async switchMain(
    requester: LibraryRequester,
    mapId: string,
    isMain: boolean,
    save: (maps: LibraryMapDaos['maps']) => Promise<void>,
  ): Promise<LibraryMapSummaryDto> {
    const { row, changed } = await this.edit(
      requester,
      `change the main map at ${mapId}`,
      async (daos): Promise<MainSwitch> => {
        const current = await requireMapRow(daos, requester, mapId);
        if (current.map.isMain === isMain) return { row: current, changed: false };
        await save(daos.maps);
        return { row: await requireMapRow(daos, requester, mapId), changed: true };
      },
    );
    if (changed) this.announce(requester.campaignId);
    return toLibraryMapSummaryDto(row);
  }

  private async edit<T>(
    requester: LibraryRequester,
    action: string,
    work: (daos: LibraryMapDaos, campaign: CampaignWithOwnerPo) => Promise<T>,
  ): Promise<T> {
    return editAsMaster(this.deps, requester, action, (daos, _access, campaign) =>
      work(daos, campaign),
    );
  }

  private async requireMapRoom(daos: LibraryMapDaos, campaign: CampaignWithOwnerPo): Promise<void> {
    const stored = await daos.maps.countOfCampaign(campaign.id);
    PlanLimitsBo.requireRoom('libraryMaps', stored, 1, effectiveLimitsOf(campaign.owner));
  }

  private async requireFreeAsset(
    daos: LibraryMapDaos,
    campaignId: string,
    assetId: string,
  ): Promise<void> {
    const asset = await daos.assets.findInCampaign(campaignId, assetId);
    const usedByAnotherMap = (await daos.maps.findByAsset(campaignId, assetId)) !== undefined;
    requireFreeMapAsset(assetId, asset, usedByAnotherMap);
  }

  private async requireFolder(
    daos: LibraryMapDaos,
    campaignId: string,
    folderId: string | null,
  ): Promise<void> {
    const folders = await daos.folders.listOfCampaign(campaignId);
    const { maxFolderDepth } = this.deps;
    const tree = { campaignId, activeSceneId: null, maxFolderDepth, folders, scenes: [] };
    new SceneLibraryBo(tree).requireKnown(folderId);
  }

  private announce(campaignId: string): void {
    this.deps.publisher.libraryChanged({ campaignId, at: this.deps.clock.now().toISOString() });
  }
}
