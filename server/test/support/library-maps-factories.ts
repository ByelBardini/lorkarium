import type { MapRegionGeometry } from '@lorkarium/game-core';
import type {
  MapRegionPo,
  NewMapRegionPo,
} from '../../src/modules/library-maps/library-map-regions.po';
import type { LibraryMapRow } from '../../src/modules/library-maps/library-maps.dao';
import type { LibraryMapReachPo } from '../../src/modules/library-maps/library-maps.dao';
import type { NewLibraryMapPo } from '../../src/modules/library-maps/library-maps.po';
import { lyraPortraitPo } from './assets-factories';
import { VHARN_ID } from './campaigns-factories';

export const MAP_ART_ID = '3b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

export const KINGDOM_GEOMETRY: MapRegionGeometry = {
  shape: 'polygon',
  points: [
    { x: 0.1, y: 0.1 },
    { x: 0.6, y: 0.1 },
    { x: 0.35, y: 0.7 },
  ],
};
export const CITY_GEOMETRY: MapRegionGeometry = { shape: 'pin', point: { x: 0.25, y: 0.75 } };

export const MUNDO_MAP_ID = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
export const REINO_REGION_ID = '4b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const MAP_AT = new Date('2026-11-09T15:00:00Z');

/** A private map called "Mundo", not the main one, with its image, in Vharn.
 *
 *  Example: `libraryMapRow({ id: masmorraId, isMain: true }).map.name` */
export function libraryMapRow(changes: Partial<LibraryMapReachPo> = {}): LibraryMapRow {
  const asset = lyraPortraitPo({ purpose: 'library_map', id: changes.assetId ?? MAP_ART_ID });
  const map: LibraryMapReachPo = {
    id: MUNDO_MAP_ID,
    campaignId: VHARN_ID,
    folderId: null,
    assetId: asset.id,
    name: 'Mundo',
    visibility: 'private',
    isMain: false,
    hiddenByFolder: false,
    version: 0,
    createdAt: MAP_AT,
    updatedAt: MAP_AT,
    ...changes,
  };
  return { map, asset };
}

/** The insert of a map called "Mundo"; the columns left out take the defaults of the table.
 *
 *  Example: `await maps.insert(newLibraryMapPo({ campaignId: vharn.id, assetId: art.id }))` */
export function newLibraryMapPo(
  overrides: Partial<NewLibraryMapPo> & Pick<NewLibraryMapPo, 'campaignId' | 'assetId'>,
): NewLibraryMapPo {
  return { name: 'Mundo', ...overrides };
}

/** The insert of a polygon region called "Reino de Vharn", without a link.
 *
 *  Example: `await regions.insert(newMapRegionPo({ campaignId: vharn.id, mapId: mundo.id }))` */
export function newMapRegionPo(
  overrides: Partial<NewMapRegionPo> & Pick<NewMapRegionPo, 'campaignId' | 'mapId'>,
): NewMapRegionPo {
  return { name: 'Reino de Vharn', geometry: KINGDOM_GEOMETRY, color: '#aa3300', ...overrides };
}

/** A visible polygon called "Reino de Vharn" on "Mundo", without a link.
 *
 *  Example: `mapRegionPo({ hidden: true, linkKind: 'document', targetDocumentId: diarioId })` */
export function mapRegionPo(changes: Partial<MapRegionPo> = {}): MapRegionPo {
  return {
    id: REINO_REGION_ID,
    campaignId: VHARN_ID,
    mapId: MUNDO_MAP_ID,
    name: 'Reino de Vharn',
    description: '',
    geometry: KINGDOM_GEOMETRY,
    color: '#aa3300',
    icon: 'pin',
    hidden: false,
    linkKind: null,
    targetDocumentId: null,
    targetDocumentTabId: null,
    targetSceneId: null,
    targetMapId: null,
    targetImageId: null,
    createdAt: MAP_AT,
    updatedAt: MAP_AT,
    ...changes,
  };
}
