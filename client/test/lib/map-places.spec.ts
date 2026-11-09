import type { MapRegionDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { mapPlacesMatching, mapPlacesTree, type MapPlaceNode } from '@/lib/map-places';
import { mapRegion, pinRegion } from '../support/library-map-fixtures';

function square(corner: number, side: number): MapRegionDto['geometry'] {
  return {
    shape: 'polygon',
    points: [
      { x: corner, y: corner },
      { x: corner + side, y: corner },
      { x: corner + side, y: corner + side },
      { x: corner, y: corner + side },
    ],
  };
}

const REINO = mapRegion({ id: 'reino', name: 'Reino', geometry: square(0.1, 0.8) });
const CIDADE = mapRegion({ id: 'cidade', name: 'Cidade', geometry: square(0.4, 0.2) });
const ARVORE = mapRegion({ id: 'arvore', name: 'Árvore', geometry: square(0.2, 0.05) });
const TAVERNA = pinRegion({
  id: 'taverna',
  name: 'Taverna',
  geometry: { shape: 'pin', point: { x: 0.5, y: 0.5 } },
});
const PORTO = pinRegion({
  id: 'porto',
  name: 'Porto',
  geometry: { shape: 'pin', point: { x: 0.95, y: 0.95 } },
});
const ALL = [TAVERNA, PORTO, CIDADE, ARVORE, REINO];

type Outline = { [name: string]: Outline };

function outlineOf(nodes: readonly MapPlaceNode[]): Outline {
  return Object.fromEntries(nodes.map((node) => [node.region.name, outlineOf(node.children)]));
}

function namesOf(nodes: readonly MapPlaceNode[]): string[] {
  return nodes.map((node) => node.region.name);
}

describe('mapPlacesTree', () => {
  it('nests each place under the region around it', () => {
    expect(outlineOf(mapPlacesTree(ALL))).toEqual({
      Reino: { Árvore: {}, Cidade: { Taverna: {} } },
      Porto: {},
    });
  });

  it('orders each level by name, ignoring accents', () => {
    const places = mapPlacesTree(ALL);
    expect(namesOf(places)).toEqual(['Porto', 'Reino']);
    expect(namesOf(places[1]?.children ?? [])).toEqual(['Árvore', 'Cidade']);
  });

  it('a place whose region is hidden from this reader rises to the one above', () => {
    expect(outlineOf(mapPlacesTree([TAVERNA, REINO]))).toEqual({ Reino: { Taverna: {} } });
  });

  it('with no regions, no places', () => {
    expect(mapPlacesTree([])).toEqual([]);
  });
});

describe('mapPlacesMatching', () => {
  const tree = mapPlacesTree(ALL);

  it('an empty search keeps the whole tree', () => {
    expect(mapPlacesMatching(tree, '  ')).toEqual(tree);
  });

  it('keeps the way down to a place found deep in the tree', () => {
    expect(outlineOf(mapPlacesMatching(tree, 'TAVERNA'))).toEqual({
      Reino: { Cidade: { Taverna: {} } },
    });
  });

  it('finds without accents', () => {
    expect(outlineOf(mapPlacesMatching(tree, 'arvore'))).toEqual({ Reino: { Árvore: {} } });
  });

  it('a parent found by name does not bring the children that do not match', () => {
    expect(outlineOf(mapPlacesMatching(tree, 'cidade'))).toEqual({ Reino: { Cidade: {} } });
  });

  it('finding nothing leaves nothing', () => {
    expect(mapPlacesMatching(tree, 'xyz')).toEqual([]);
  });
});
