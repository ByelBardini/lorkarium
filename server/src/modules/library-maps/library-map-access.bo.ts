import { AssetNotFoundError } from '../assets/assets.error';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { LibraryMapNotFoundError, MapIsMainError } from './library-maps.error';

export type LibraryMapExposure = Readonly<{
  visibility: 'private' | 'public';
  isMain: boolean;
  hiddenByFolder: boolean;
}>;

/** A map everyone at the table may see, without being a master: public and in no private folder,
 *  or the main one even while it is private or in a private folder.
 *
 *  Example: `isMapOpenToTable({ visibility: 'private', isMain: true, hiddenByFolder: false }) // true` */
export function isMapOpenToTable(map: LibraryMapExposure): boolean {
  return map.isMain || (map.visibility === 'public' && !map.hiddenByFolder);
}

/** Who sees a map of the library: a master always; anyone else a public map, or the main one
 *  even while it is private, for as long as it stays the main one.
 *
 *  Example: `new LibraryMapAccessBo(access).canSee(map)` */
export class LibraryMapAccessBo {
  constructor(private readonly access: CampaignAccessBo) {}

  /** Someone who is not a member gets CAMPAIGN_NOT_FOUND.
   *
   *  Example: `maps.filter((row) => mapAccess.canSee(row.map))` */
  canSee(map: LibraryMapExposure): boolean {
    return this.access.isMaster() || isMapOpenToTable(map);
  }

  /** A hidden region only reaches a master, whatever the map.
   *
   *  Example: `mapAccess.canSeeRegion(row.map, { hidden: true })` */
  canSeeRegion(map: LibraryMapExposure, region: Readonly<{ hidden: boolean }>): boolean {
    return this.canSee(map) && (this.access.isMaster() || !region.hidden);
  }

  /** Refuses a map the reader may not see as if it did not exist.
   *
   *  Example: `mapAccess.requireSee(row.map)` */
  requireSee(map: LibraryMapExposure & Readonly<{ id: string }>): void {
    if (this.canSee(map)) return;
    throw new LibraryMapNotFoundError(this.access.campaignIdOf(), map.id, this.access.userIdOf());
  }
}

/** The main map stays until the master picks another one or none.
 *
 *  Example: `requireMapDeletable(row.map)` */
export function requireMapDeletable(map: LibraryMapExposure & Readonly<{ id: string }>): void {
  if (map.isMain) throw new MapIsMainError(map.id);
}

/** The image of a new map: sent for a map and not yet used by another one. Every refusal looks
 *  the same, so an id of another table tells nothing.
 *
 *  Example: `requireFreeMapAsset(assetId, asset, usedByAnotherMap)` */
export function requireFreeMapAsset(
  assetId: string,
  asset: Readonly<{ purpose: string }> | undefined,
  usedByAnotherMap: boolean,
): void {
  if (asset?.purpose === 'library_map' && !usedByAnotherMap) return;
  throw new AssetNotFoundError(assetId);
}
