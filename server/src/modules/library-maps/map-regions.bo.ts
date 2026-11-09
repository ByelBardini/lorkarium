import { MAP_REGIONS_MAX, mapRegionGeometry, type MapRegionGeometry } from '@lorkarium/game-core';
import { isMapOpenToTable, type LibraryMapExposure } from './library-map-access.bo';
import {
  MapLinkSelfError,
  MapRegionGeometryInvalidError,
  MapRegionNotShowableError,
  MapRegionsFullError,
} from './library-maps.error';
import type { MapLinkKind, MapRegionLinkColumns } from './map-region-projection.bo';

export type MapLinkChoice = Readonly<{ kind: MapLinkKind; id: string }>;

/** A map holds up to `MAP_REGIONS_MAX` regions.
 *
 *  Example: `requireRegionRoom(mapId, await regions.countOfMap(campaignId, mapId))` */
export function requireRegionRoom(mapId: string, regionsOnMap: number): void {
  if (regionsOnMap < MAP_REGIONS_MAX) return;
  throw new MapRegionsFullError(mapId, regionsOnMap, MAP_REGIONS_MAX);
}

/** A map cannot lead to itself; a cycle through another map is fine.
 *
 *  Example: `requireLinkNotSelf(mapId, { kind: 'map', id: otherMapId })` */
export function requireLinkNotSelf(mapId: string, link: MapLinkChoice): void {
  if (link.kind === 'map' && link.id === mapId) throw new MapLinkSelfError(mapId);
}

/** The geometry to save, which the game-core approved: the DTO cannot tell a polygon of no area.
 *
 *  Example: `validRegionGeometry({ shape: 'pin', point: { x: 0.5, y: 0.5 } })` */
export function validRegionGeometry(geometry: MapRegionGeometry): MapRegionGeometry {
  try {
    return mapRegionGeometry(geometry);
  } catch (error) {
    if (error instanceof RangeError) throw new MapRegionGeometryInvalidError(error.message);
    throw error;
  }
}

// Always the kind and the four targets together: a target left behind breaks the table's CHECK.
/** The columns of a link; `null` clears them.
 *
 *  Example: `linkColumnsOf({ kind: 'scene', id: salaoId }).targetSceneId // salaoId` */
export function linkColumnsOf(link: MapLinkChoice | null): MapRegionLinkColumns {
  const targetOf = (kind: MapLinkKind): string | null => (link?.kind === kind ? link.id : null);
  return {
    linkKind: link?.kind ?? null,
    targetDocumentId: targetOf('document'),
    targetSceneId: targetOf('scene'),
    targetMapId: targetOf('map'),
    targetImageId: targetOf('image'),
  };
}

/** Only what a player can see may be shown to the room, or the event would name a hidden place.
 *
 *  Example: `requireRegionShowable(row.map, region)` */
export function requireRegionShowable(
  map: LibraryMapExposure & Readonly<{ id: string }>,
  region: Readonly<{ id: string; hidden: boolean }>,
): void {
  if (!region.hidden && isMapOpenToTable(map)) return;
  throw new MapRegionNotShowableError(map.id, region.id);
}
