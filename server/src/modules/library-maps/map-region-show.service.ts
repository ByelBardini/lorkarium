import { viewerAccessOf } from '../campaigns/member-access';
import type { LibraryRequester } from '../library/library.service';
import { MapRegionNotFoundError } from './library-maps.error';
import { requireMapRow, type LibraryMapServiceDeps } from './library-maps.service';
import { requireRegionShowable } from './map-regions.bo';

/** The master shows a region to whoever is in the room: an ephemeral event that saves nothing and
 *  moves no version, so nothing needs a lock or a commit. It carries only ids: each client reads
 *  the region through the route that projects for its reader.
 *
 *  Example: `await new MapRegionShowService(deps).show(requester, mapId, regionId)` */
export class MapRegionShowService {
  constructor(private readonly deps: LibraryMapServiceDeps) {}

  /** Refuses what a player could not see with MAP_REGION_NOT_SHOWABLE.
   *
   *  Example: `await shows.show(requester, mapId, regionId)` */
  async show(requester: LibraryRequester, mapId: string, regionId: string): Promise<void> {
    await this.requireShowable(requester, mapId, regionId);
    const { campaignId } = requester;
    const { clock, newId, publisher } = this.deps;
    const at = clock.now().toISOString();
    publisher.mapRegionShown({ eventId: newId(), campaignId, mapId, regionId, at });
  }

  private async requireShowable(
    requester: LibraryRequester,
    mapId: string,
    regionId: string,
  ): Promise<void> {
    await this.deps.snapshot(async (daos) => {
      const { campaignId, userId } = requester;
      const access = await viewerAccessOf(daos.members, campaignId, userId);
      access.requireMaster(`show region ${regionId} of map ${mapId}`);
      const { map } = await requireMapRow(daos, requester, mapId);
      const region = await daos.regions.findInMap(campaignId, mapId, regionId);
      if (!region) throw new MapRegionNotFoundError(mapId, regionId);
      requireRegionShowable(map, region);
    });
  }
}
