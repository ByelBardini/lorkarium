import { describe, expect, it } from 'vitest';
import { libraryMapChangedDto, libraryMapRegionShownDto } from '../../src';

const id = '00000000-0000-4000-8000-000000000001';
const at = '2026-11-09T00:00:00.000Z';
const changed = { campaignId: id, mapId: id, version: 3, at };
const shown = { eventId: id, campaignId: id, mapId: id, regionId: id, at };

describe('library map events', () => {
  it('mapChanged carries only the map and its version', () => {
    expect(libraryMapChangedDto.parse(changed)).toEqual(changed);
  });
  it.each([
    ['name', { name: 'Reino' }],
    ['geometry', { geometry: { shape: 'pin', point: { x: 0.5, y: 0.5 } } }],
  ])('mapChanged carrying a region %s is refused: a hidden one never crosses', (_f, leak) => {
    expect(libraryMapChangedDto.safeParse({ ...changed, ...leak }).success).toBe(false);
  });
  it('mapChanged with a negative version is refused', () => {
    expect(libraryMapChangedDto.safeParse({ ...changed, version: -1 }).success).toBe(false);
  });
  it('mapRegionShown says which region, nothing of its content', () => {
    expect(libraryMapRegionShownDto.parse(shown)).toEqual(shown);
    const withName = { ...shown, name: 'Reino' };
    expect(libraryMapRegionShownDto.safeParse(withName).success).toBe(false);
  });
  it('mapRegionShown without an eventId is refused', () => {
    const anonymous = { campaignId: id, mapId: id, regionId: id, at };
    expect(libraryMapRegionShownDto.safeParse(anonymous).success).toBe(false);
  });
});
