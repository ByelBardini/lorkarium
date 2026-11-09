import { describe, expect, it } from 'vitest';
import {
  ASSET_MAX_SIDE,
  assetPurposeDto,
  campaignLibraryDto,
  createLibraryMapRequestDto,
  createMapRegionRequestDto,
  libraryMapDetailDto,
  libraryMapSummaryDto,
  mainMapResponseDto,
  mapAppearancesResponseDto,
  mapRegionDto,
  mapRegionLinkDto,
  updateLibraryMapRequestDto,
  updateMapRegionRequestDto,
} from '../../src';

const id = '00000000-0000-4000-8000-000000000001';
const at = '2026-11-09T00:00:00.000Z';
const triangle = {
  shape: 'polygon',
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0.5, y: 1 },
  ],
};
const pin = { shape: 'pin', point: { x: 0.5, y: 0.5 } };
const newRegion = { name: 'Reino', geometry: triangle, color: '#aa3300' };
const summary = {
  id,
  name: 'Mundo',
  folderId: null,
  visibility: 'private',
  isMain: false,
  asset: { id, mimeType: 'image/webp', width: 8192, height: 4096 },
  version: 0,
  updatedAt: at,
};
const region = { ...newRegion, id, description: '', icon: 'pin', hidden: false, link: null };

function polygonOf(vertices: number): { shape: string; points: { x: number; y: number }[] } {
  const points = Array.from({ length: vertices }, (_, index) => ({
    x: index / vertices,
    y: index % 2,
  }));
  return { shape: 'polygon', points };
}

describe('library map bodies', () => {
  it('trims the name of a new map and needs nothing else besides the asset', () => {
    expect(createLibraryMapRequestDto.parse({ name: '  Mundo ', assetId: id })).toEqual({
      name: 'Mundo',
      assetId: id,
    });
  });
  it.each([
    ['60 characters', true, 'a'.repeat(60)],
    ['61 characters', false, 'a'.repeat(61)],
    ['only spaces', false, '   '],
  ])('a map name of %s has success %s', (_label, accepted, name) => {
    expect(createLibraryMapRequestDto.safeParse({ name, assetId: id }).success).toBe(accepted);
  });
  it.each([
    ['a forged userId', { userId: id }],
    ['a forged campaignId', { campaignId: id }],
    ['isMain, which has its own route', { isMain: true }],
  ])('creating a map with %s is refused', (_label, extra) => {
    const body = { name: 'Mundo', assetId: id, ...extra };
    expect(createLibraryMapRequestDto.safeParse(body).success).toBe(false);
  });
  it('an empty map patch is refused', () => {
    expect(updateLibraryMapRequestDto.safeParse({}).success).toBe(false);
  });
  it('a map patch taking it to the root keeps only that key', () => {
    expect(updateLibraryMapRequestDto.parse({ folderId: null })).toEqual({ folderId: null });
  });
  it('a map patch cannot swap the image of the map', () => {
    expect(updateLibraryMapRequestDto.safeParse({ name: 'Mundo', assetId: id }).success).toBe(
      false,
    );
  });
});

describe('map region geometry', () => {
  it('a polygon region without optional fields is born visible, unlinked and undescribed', () => {
    expect(createMapRegionRequestDto.parse(newRegion)).toEqual({
      ...newRegion,
      description: '',
      icon: 'pin',
      hidden: false,
      link: null,
    });
  });
  it('a pin keeps its single point', () => {
    const parsed = createMapRegionRequestDto.parse({ ...newRegion, geometry: pin });
    expect(parsed.geometry).toEqual(pin);
  });
  it.each([
    [2, false],
    [3, true],
    [128, true],
    [129, false],
  ])('a polygon of %i vertices has success %s', (vertices, accepted) => {
    const body = { ...newRegion, geometry: polygonOf(vertices) };
    expect(createMapRegionRequestDto.safeParse(body).success).toBe(accepted);
  });
  it.each([
    [0, true],
    [1, true],
    [1.5, false],
    [-0.1, false],
    [Number.NaN, false],
  ])('a pin at x = %d has success %s', (x, accepted) => {
    const body = { ...newRegion, geometry: { shape: 'pin', point: { x, y: 0.5 } } };
    expect(createMapRegionRequestDto.safeParse(body).success).toBe(accepted);
  });
  it.each([
    ['an unknown shape', { shape: 'circle', point: { x: 0.5, y: 0.5 } }],
    ['a pin carrying polygon points', { ...pin, points: triangle.points }],
    ['a point with an extra axis', { shape: 'pin', point: { x: 0.5, y: 0.5, z: 1 } }],
  ])('%s is refused', (_label, geometry) => {
    expect(createMapRegionRequestDto.safeParse({ ...newRegion, geometry }).success).toBe(false);
  });
});

describe('map region bodies', () => {
  it.each([['document'], ['scene'], ['map'], ['image']])('a region may link to a %s', (kind) => {
    const link = { kind, id };
    expect(createMapRegionRequestDto.parse({ ...newRegion, link }).link).toEqual(link);
  });
  it('a region may be created without a link', () => {
    expect(createMapRegionRequestDto.parse({ ...newRegion, link: null }).link).toBeNull();
  });
  it('a link to a sheet is refused, sheets depend on holder and sandbox', () => {
    const link = { kind: 'sheet', id };
    expect(createMapRegionRequestDto.safeParse({ ...newRegion, link }).success).toBe(false);
  });
  it.each([
    ['a 60-character name', true, { name: 'a'.repeat(60) }],
    ['a 61-character name', false, { name: 'a'.repeat(61) }],
    ['a blank name', false, { name: '  ' }],
    ['a 500-character description', true, { description: 'a'.repeat(500) }],
    ['a 501-character description', false, { description: 'a'.repeat(501) }],
    ['a color by name', false, { color: 'red' }],
    ['a short hex color', false, { color: '#abc' }],
  ])('a region with %s has success %s', (_label, accepted, field) => {
    const body = { ...newRegion, ...field };
    expect(createMapRegionRequestDto.safeParse(body).success).toBe(accepted);
  });
  it('a region with a forged userId is refused', () => {
    expect(createMapRegionRequestDto.safeParse({ ...newRegion, userId: id }).success).toBe(false);
  });
  it('a patch with only hidden fills in no default', () => {
    expect(updateMapRegionRequestDto.parse({ hidden: true })).toEqual({ hidden: true });
  });
  it('a patch with a null link removes it instead of counting as absent', () => {
    expect(updateMapRegionRequestDto.parse({ link: null })).toEqual({ link: null });
  });
  it('an empty region patch is refused', () => {
    expect(updateMapRegionRequestDto.safeParse({}).success).toBe(false);
  });
  it('a region patch with a forged userId is refused', () => {
    const patch = { hidden: true, userId: id };
    expect(updateMapRegionRequestDto.safeParse(patch).success).toBe(false);
  });
});

describe('the icon of a pin', () => {
  it('a new region without one gets the plain marker', () => {
    expect(createMapRegionRequestDto.parse({ ...newRegion, geometry: pin }).icon).toBe('pin');
  });

  it('a new region can choose one', () => {
    expect(createMapRegionRequestDto.parse({ ...newRegion, icon: 'castle' }).icon).toBe('castle');
  });

  it('refuses an icon out of the list', () => {
    expect(createMapRegionRequestDto.safeParse({ ...newRegion, icon: 'dragon' }).success).toBe(
      false,
    );
  });

  it('can be the only change of an edit', () => {
    expect(updateMapRegionRequestDto.parse({ icon: 'danger' })).toEqual({ icon: 'danger' });
  });

  it('refuses an edit to an icon out of the list', () => {
    expect(updateMapRegionRequestDto.safeParse({ icon: 'dragon' }).success).toBe(false);
  });

  it('every region on the wire says its icon', () => {
    const withoutIcon = Object.fromEntries(
      Object.entries(region).filter(([key]) => key !== 'icon'),
    );
    expect(mapRegionDto.safeParse(withoutIcon).success).toBe(false);
  });
});

describe('projected region link', () => {
  it.each([
    ['an open link', { state: 'open', kind: 'document', id, name: 'Reino de Aer' }],
    ['a locked link', { state: 'locked' }],
    ['a removed link', { state: 'removed', kind: 'scene' }],
    ['no link', null],
  ])('%s goes through untouched', (_label, link) => {
    expect(mapRegionLinkDto.parse(link)).toEqual(link);
  });
  it.each([
    ['id', { id }],
    ['name', { name: 'Cripta' }],
    ['kind', { kind: 'document' }],
  ])('a locked link carrying its %s is refused, so the DTO cannot leak it', (_field, leak) => {
    expect(mapRegionLinkDto.safeParse({ state: 'locked', ...leak }).success).toBe(false);
  });
  it('a removed link carrying the name of the deleted item is refused', () => {
    const link = { state: 'removed', kind: 'map', name: 'Cripta' };
    expect(mapRegionLinkDto.safeParse(link).success).toBe(false);
  });
  it('an open link without the name of the target is refused', () => {
    expect(mapRegionLinkDto.safeParse({ state: 'open', kind: 'map', id }).success).toBe(false);
  });
});

describe('map read models', () => {
  it('a region as read carries its projected link', () => {
    const locked = { ...region, link: { state: 'locked' } };
    expect(mapRegionDto.parse(locked)).toEqual(locked);
  });
  it.each([
    [300, true],
    [301, false],
  ])('a map detail with %i regions has success %s', (count, accepted) => {
    const regions = Array.from({ length: count }, () => region);
    expect(libraryMapDetailDto.safeParse({ ...summary, regions }).success).toBe(accepted);
  });
  it('a map summary carrying regions is refused, regions are only read one map at a time', () => {
    expect(libraryMapSummaryDto.safeParse({ ...summary, regions: [] }).success).toBe(false);
  });
  it.each([
    ['a table without a main map', null],
    ['a table with a main map', summary],
  ])('the main map answer accepts %s', (_label, map) => {
    expect(mainMapResponseDto.parse({ map })).toEqual({ map });
  });
  it('an appearance carries only what opens the map at the region', () => {
    const appearance = { mapId: id, mapName: 'Mundo', regionId: id, regionName: 'Reino' };
    const answer = { appearances: [appearance] };
    expect(mapAppearancesResponseDto.parse(answer)).toEqual(answer);
    const withGeometry = { appearances: [{ ...appearance, geometry: pin }] };
    expect(mapAppearancesResponseDto.safeParse(withGeometry).success).toBe(false);
  });
});

describe('maps in the campaign library and in the assets', () => {
  const library = { activeSceneId: null, folders: [], scenes: [], images: [], documents: [] };

  it('the aggregate takes the map summaries and the main map id', () => {
    const aggregate = { ...library, maps: [summary], mainMapId: id };
    expect(campaignLibraryDto.parse(aggregate)).toEqual(aggregate);
  });
  it.each([
    ['maps', { mainMapId: null }],
    ['mainMapId', { maps: [] }],
  ])('an aggregate without %s is refused', (_field, partial) => {
    expect(campaignLibraryDto.safeParse({ ...library, ...partial }).success).toBe(false);
  });
  it('library_map is an asset purpose', () => {
    expect(assetPurposeDto.parse('library_map')).toBe('library_map');
  });
  it('a map image keeps up to 8192 pixels on its largest side', () => {
    expect(ASSET_MAX_SIDE.library_map).toBe(8192);
  });
});
