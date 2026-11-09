import type { MapRegionDto } from '@lorkarium/contracts';
import { mapRegionParents } from '@lorkarium/game-core';
import { searchText } from '@/lib/search-text';

export type MapPlaceNode = Readonly<{
  region: MapRegionDto;
  children: readonly MapPlaceNode[];
}>;

/** The places of a map as a tree: each one under the region around it, every level by name. It
 *  takes the regions this reader receives, so a place inside a hidden region rises a level.
 *
 *  Example: `mapPlacesTree(map.regions)[0]?.children` */
export function mapPlacesTree(regions: readonly MapRegionDto[]): MapPlaceNode[] {
  const parents = mapRegionParents(regions);
  const nodeOf = (region: MapRegionDto): MapPlaceNode => ({
    region,
    children: inNameOrder(regions.filter(({ id }) => parents.get(id) === region.id)).map(nodeOf),
  });
  return inNameOrder(regions.filter(({ id }) => !parents.has(id))).map(nodeOf);
}

function inNameOrder(regions: readonly MapRegionDto[]): MapRegionDto[] {
  return [...regions].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** The tree cut down to the places whose name has the search, without accents or case, each with
 *  the way down to it. A blank search keeps everything.
 *
 *  Example: `mapPlacesMatching(mapPlacesTree(regions), 'taverna')` */
export function mapPlacesMatching(
  places: readonly MapPlaceNode[],
  query: string,
): readonly MapPlaceNode[] {
  const wanted = searchText(query.trim());
  return wanted ? placesWith(places, wanted) : places;
}

function placesWith(places: readonly MapPlaceNode[], wanted: string): MapPlaceNode[] {
  return places.flatMap((place) => {
    const children = placesWith(place.children, wanted);
    const found = searchText(place.region.name).includes(wanted);
    return found || children.length > 0 ? [{ region: place.region, children }] : [];
  });
}
