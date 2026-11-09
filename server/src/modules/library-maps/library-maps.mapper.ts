import type {
  LibraryMapDetailDto,
  LibraryMapSummaryDto,
  MapAppearanceDto,
  MapRegionDto,
} from '@lorkarium/contracts';
import { hexColorDto } from '@lorkarium/contracts';
import { toAssetDto } from '../assets/assets.mapper';
import type { MapAppearanceRow } from './library-map-regions.dao';
import type { LibraryMapRow } from './library-maps.dao';
import type { ProjectedMapRegion } from './map-region-projection.bo';

/** A map and its image → how the library lists it.
 *
 *  Example: `toLibraryMapSummaryDto(row).isMain // false` */
export function toLibraryMapSummaryDto({ map, asset }: LibraryMapRow): LibraryMapSummaryDto {
  return {
    id: map.id,
    name: map.name,
    folderId: map.folderId,
    visibility: map.visibility,
    isMain: map.isMain,
    asset: toAssetDto(asset),
    version: map.version,
    updatedAt: map.updatedAt.toISOString(),
  };
}

/** The summary plus the regions already chosen for this reader.
 *
 *  Example: `toLibraryMapDetailDto(row, regions).regions.length // 12` */
export function toLibraryMapDetailDto(
  row: LibraryMapRow,
  regions: readonly MapRegionDto[],
): LibraryMapDetailDto {
  return { ...toLibraryMapSummaryDto(row), regions: [...regions] };
}

/** A region already projected for its reader → what goes on the wire, field by field, so that
 *  nothing of the row but what the DTO names can leave.
 *
 *  Example: `toMapRegionDto({ region, link: { state: 'locked' } }).link` */
export function toMapRegionDto({ region, link }: ProjectedMapRegion): MapRegionDto {
  return {
    id: region.id,
    name: region.name,
    description: region.description,
    geometry: region.geometry,
    color: hexColorDto.parse(region.color),
    icon: region.icon,
    hidden: region.hidden,
    link,
  };
}

/** A place where a document appears → what it takes to open the map at that region.
 *
 *  Example: `toMapAppearanceDto(row).regionName // 'Reino'` */
export function toMapAppearanceDto(row: MapAppearanceRow): MapAppearanceDto {
  const { mapId, mapName, regionId, regionName, tabName } = row;
  return { mapId, mapName, regionId, regionName, tabName };
}
