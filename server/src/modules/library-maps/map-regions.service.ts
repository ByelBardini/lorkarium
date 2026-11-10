import type {
  CreateMapRegionRequestDto,
  MapRegionDto,
  UpdateMapRegionRequestDto,
} from '@lorkarium/contracts';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { LibraryRequester } from '../library/library.service';
import type { MapRegionChangesPo, MapRegionPo } from './library-map-regions.po';
import {
  LibraryMapNotFoundError,
  MapLinkTargetNotFoundError,
  MapRegionNotFoundError,
} from './library-maps.error';
import {
  editAsMaster,
  requireMapRow,
  type LibraryMapDaos,
  type LibraryMapServiceDeps,
} from './library-maps.service';
import { readMapRegions } from './map-region-links.service';
import {
  linkColumnsOf,
  requireLinkNotSelf,
  requireRegionRoom,
  validRegionGeometry,
  type MapLinkChoice,
} from './map-regions.bo';

type RegionWork<T> = (daos: LibraryMapDaos, access: CampaignAccessBo) => Promise<T>;

function regionChangesOf(changes: UpdateMapRegionRequestDto): MapRegionChangesPo {
  const { link, geometry, ...fields } = changes;
  return {
    ...fields,
    ...(geometry && { geometry: validRegionGeometry(geometry) }),
    ...(link !== undefined && linkColumnsOf(link)),
  };
}

async function targetExists(
  daos: LibraryMapDaos,
  campaignId: string,
  { kind, id, tabId }: MapLinkChoice,
): Promise<boolean> {
  const { linkTargets } = daos;
  if (tabId !== undefined) {
    const tabs = await linkTargets.documentTabsIn(campaignId, [tabId]);
    return tabs.some(({ documentId }) => documentId === id);
  }
  const lookup = {
    document: () => linkTargets.documentsIn(campaignId, [id]),
    scene: () => linkTargets.scenesIn(campaignId, [id]),
    map: () => linkTargets.mapsIn(campaignId, [id]),
    image: () => linkTargets.imagesIn(campaignId, [id]),
  }[kind];
  return (await lookup()).length > 0;
}

/** Writes the regions of a map. Every write is the master's, runs with the campaign locked, goes
 *  one version up, commits, and only then tells the table `library:mapChanged`, which carries no
 *  name and no shape: each client reads back through the route that projects for its reader.
 *
 *  Example: `await regions.create(requester, mapId, { name: 'Reino', geometry, color, hidden: false, description: '', link: null })` */
export class MapRegionsService {
  constructor(private readonly deps: LibraryMapServiceDeps) {}

  /** A new region, answered as its master reads it.
   *
   *  Example: `(await regions.create(requester, mapId, input)).link` */
  async create(
    requester: LibraryRequester,
    mapId: string,
    input: CreateMapRegionRequestDto,
  ): Promise<MapRegionDto> {
    const action = `create a region on map ${mapId}`;
    return this.write(requester, mapId, action, async (daos, access) => {
      const { campaignId } = requester;
      requireRegionRoom(mapId, await daos.regions.countOfMap(campaignId, mapId));
      const { link, geometry, ...fields } = input;
      await this.requireLink(daos, campaignId, mapId, link);
      const columns = { geometry: validRegionGeometry(geometry), ...linkColumnsOf(link) };
      const saved = await daos.regions.insert({ ...fields, campaignId, mapId, ...columns });
      return this.answerOf(daos, access, saved);
    });
  }

  /** Edits a region; an absent key stays and `link: null` takes the link off.
   *
   *  Example: `await regions.update(requester, mapId, regionId, { hidden: true })` */
  async update(
    requester: LibraryRequester,
    mapId: string,
    regionId: string,
    changes: UpdateMapRegionRequestDto,
  ): Promise<MapRegionDto> {
    const action = `edit region ${regionId} of map ${mapId}`;
    return this.write(requester, mapId, action, async (daos, access) => {
      const { campaignId } = requester;
      await this.requireLink(daos, campaignId, mapId, changes.link);
      const saved = await daos.regions.update(
        campaignId,
        mapId,
        regionId,
        regionChangesOf(changes),
      );
      if (!saved) throw new MapRegionNotFoundError(mapId, regionId);
      return this.answerOf(daos, access, saved);
    });
  }

  /** Example: `await regions.delete(requester, mapId, regionId)` */
  async delete(requester: LibraryRequester, mapId: string, regionId: string): Promise<void> {
    const action = `delete region ${regionId} of map ${mapId}`;
    await this.write(requester, mapId, action, async (daos) => {
      const removed = await daos.regions.delete(requester.campaignId, mapId, regionId);
      if (!removed) throw new MapRegionNotFoundError(mapId, regionId);
    });
  }

  private async write<T>(
    requester: LibraryRequester,
    mapId: string,
    action: string,
    work: RegionWork<T>,
  ): Promise<T> {
    const { campaignId, userId } = requester;
    const { result, version } = await editAsMaster(
      this.deps,
      requester,
      action,
      async (daos, access) => {
        await requireMapRow(daos, requester, mapId);
        const result = await work(daos, access);
        const version = await daos.maps.bumpVersion(campaignId, mapId);
        if (version === undefined) throw new LibraryMapNotFoundError(campaignId, mapId, userId);
        return { result, version };
      },
    );
    const at = this.deps.clock.now().toISOString();
    this.deps.publisher.libraryMapChanged({ campaignId, mapId, version, at });
    return result;
  }

  private async requireLink(
    daos: LibraryMapDaos,
    campaignId: string,
    mapId: string,
    link: MapLinkChoice | null | undefined,
  ): Promise<void> {
    if (!link) return;
    requireLinkNotSelf(mapId, link);
    if (await targetExists(daos, campaignId, link)) return;
    throw new MapLinkTargetNotFoundError(campaignId, link.kind, link.id);
  }

  private async answerOf(
    daos: LibraryMapDaos,
    access: CampaignAccessBo,
    saved: MapRegionPo,
  ): Promise<MapRegionDto> {
    const [region] = await readMapRegions(daos, access, [saved]);
    if (region) return region;
    throw new Error(`region ${saved.id} did not reach its master; expected it in the projection`);
  }
}
