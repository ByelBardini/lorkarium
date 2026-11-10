import type { MapRegionDto } from '@lorkarium/contracts';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { LibraryMapDaos } from './library-maps.service';
import { toMapRegionDto } from './library-maps.mapper';
import {
  MapRegionProjectionBo,
  mapLinkTargetIdsOf,
  type MapLinkTargets,
  type MapRegionFacts,
} from './map-region-projection.bo';

function byId<Target extends Readonly<{ id: string }>>(
  targets: readonly Target[],
): ReadonlyMap<string, Target> {
  return new Map(targets.map((target) => [target.id, target]));
}

async function groupSceneIdOf(daos: LibraryMapDaos, campaignId: string): Promise<string | null> {
  return (await daos.campaigns.findById(campaignId))?.activeSceneId ?? null;
}

// Awaited one by one: every query of a snapshot runs on the same connection.
async function loadLinkTargets(
  daos: LibraryMapDaos,
  campaignId: string,
  regions: readonly MapRegionFacts[],
): Promise<MapLinkTargets> {
  const ids = mapLinkTargetIdsOf(regions);
  const { linkTargets } = daos;
  return {
    groupSceneId: ids.scenes.length > 0 ? await groupSceneIdOf(daos, campaignId) : null,
    documents: byId(await linkTargets.documentsIn(campaignId, ids.documents)),
    documentTabs: byId(await linkTargets.documentTabsIn(campaignId, ids.documentTabs)),
    scenes: byId(await linkTargets.scenesIn(campaignId, ids.scenes)),
    maps: byId(await linkTargets.mapsIn(campaignId, ids.maps)),
    images: byId(await linkTargets.imagesIn(campaignId, ids.images)),
  };
}

/** The regions as this reader may know them. Run on one executor, so that a target and the rule
 *  that guards it are read from the same state.
 *
 *  Example: `await readMapRegions(daos, access, await daos.regions.listOfMap(campaignId, mapId))` */
export async function readMapRegions(
  daos: LibraryMapDaos,
  access: CampaignAccessBo,
  regions: readonly MapRegionFacts[],
): Promise<MapRegionDto[]> {
  const targets = await loadLinkTargets(daos, access.campaignIdOf(), regions);
  return new MapRegionProjectionBo(access, targets).project(regions).map(toMapRegionDto);
}
