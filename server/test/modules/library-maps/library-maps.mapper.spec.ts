import { PLAN_LIMITS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  toLibraryMapDetailDto,
  toLibraryMapSummaryDto,
  toMapAppearanceDto,
  toMapRegionDto,
} from '../../../src/modules/library-maps/library-maps.mapper';
import {
  KINGDOM_GEOMETRY,
  MAP_ART_ID,
  MUNDO_MAP_ID,
  REINO_REGION_ID,
  libraryMapRow,
  mapRegionPo,
} from '../../support/library-maps-factories';

const NARRADOR_FIRST = { rank: 0, limits: PLAN_LIMITS.narrador };

describe('toLibraryMapSummaryDto', () => {
  it('lists the map with its image, without the storage key nor the table', () => {
    const row = libraryMapRow({ isMain: true, version: 3 });
    const summary = toLibraryMapSummaryDto(row, NARRADOR_FIRST);
    expect(summary).toEqual({
      id: MUNDO_MAP_ID,
      name: 'Mundo',
      folderId: null,
      visibility: 'private',
      isMain: true,
      asset: expect.objectContaining({ id: MAP_ART_ID }),
      version: 3,
      planLocked: false,
      updatedAt: '2026-11-09T15:00:00.000Z',
    });
    expect(JSON.stringify(summary)).not.toContain('storageKey');
  });

  it('the oldest map of a free table (no map allowed) has planLocked', () => {
    const place = { rank: 0, limits: PLAN_LIMITS.free };

    expect(toLibraryMapSummaryDto(libraryMapRow(), place).planLocked).toBe(true);
  });

  it.each([
    [2, false],
    [3, true],
  ])('map of rank %i at a narrador table (3 maps) has planLocked %s', (rank, locked) => {
    const place = { rank, limits: PLAN_LIMITS.narrador };

    expect(toLibraryMapSummaryDto(libraryMapRow(), place).planLocked).toBe(locked);
  });
});

describe('toLibraryMapDetailDto', () => {
  it('adds the regions it receives to the summary', () => {
    const row = libraryMapRow();
    const region = {
      id: '4b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
      name: 'Reino',
      description: '',
      geometry: { shape: 'pin', point: { x: 0.5, y: 0.5 } },
      color: '#aa3300',
      icon: 'pin',
      hidden: false,
      link: null,
    } as const;
    const place = { rank: 0, limits: PLAN_LIMITS.free };
    const detail = toLibraryMapDetailDto(row, [region], place);
    expect(detail).toEqual({ ...toLibraryMapSummaryDto(row, place), regions: [region] });
    expect(detail.planLocked).toBe(true);
  });
});

describe('toMapRegionDto', () => {
  const TARGET_ID = '9f2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

  it('sends the projected link and nothing of the row but what the DTO names', () => {
    const region = mapRegionPo({ linkKind: 'document', targetDocumentId: TARGET_ID });
    expect(toMapRegionDto({ region, link: { state: 'locked' } })).toStrictEqual({
      id: REINO_REGION_ID,
      name: 'Reino de Vharn',
      description: '',
      geometry: KINGDOM_GEOMETRY,
      color: '#aa3300',
      icon: 'pin',
      hidden: false,
      link: { state: 'locked' },
    });
  });

  it('sends the icon the region has', () => {
    const region = mapRegionPo({ icon: 'castle' });
    expect(toMapRegionDto({ region, link: null }).icon).toBe('castle');
  });

  it('the columns that hold the target never reach the wire', () => {
    const region = mapRegionPo({ linkKind: 'document', targetDocumentId: TARGET_ID });
    const wire = JSON.stringify(toMapRegionDto({ region, link: { state: 'locked' } }));
    expect(wire).not.toContain(TARGET_ID);
    expect(wire).not.toContain('document');
  });
});

describe('toMapAppearanceDto', () => {
  it('keeps what opens the place and drops what decided who sees it', () => {
    const row = {
      mapId: MUNDO_MAP_ID,
      mapName: 'Mundo',
      mapVisibility: 'private',
      mapIsMain: false,
      mapHiddenByFolder: false,
      regionId: REINO_REGION_ID,
      regionName: 'Reino',
      regionHidden: true,
      tabName: 'Capítulo 2',
      tabVisibility: 'document',
    } as const;
    expect(toMapAppearanceDto(row)).toStrictEqual({
      mapId: MUNDO_MAP_ID,
      mapName: 'Mundo',
      regionId: REINO_REGION_ID,
      regionName: 'Reino',
      tabName: 'Capítulo 2',
    });
  });
});
