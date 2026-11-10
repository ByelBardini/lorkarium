import { describe, expect, it } from 'vitest';
import type { CreateMapRegionRequestDto } from '@lorkarium/contracts';
import { MapRegionsService } from '../../../src/modules/library-maps/map-regions.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';
import { LibraryMapsHarness } from '../../support/library-maps-fakes';
import {
  CITY_GEOMETRY,
  KINGDOM_GEOMETRY,
  MUNDO_MAP_ID,
  REINO_REGION_ID,
  libraryMapRow,
  mapRegionPo,
} from '../../support/library-maps-factories';

const ana = { userId: ANA_ID, campaignId: VHARN_ID };
const bia = { userId: BIA_ID, campaignId: VHARN_ID };
const outsider = { userId: CAIO_ID, campaignId: VHARN_ID };
const DIARIO_ID = '9f2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const SALAO_ID = '9e2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const MASMORRA_ID = '9d2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const NEW_REGION: CreateMapRegionRequestDto = {
  name: 'Reino',
  description: '',
  geometry: KINGDOM_GEOMETRY,
  color: '#aa3300',
  icon: 'pin',
  hidden: false,
  link: null,
};
const STRAIGHT_LINE = {
  shape: 'polygon',
  points: [
    { x: 0.1, y: 0.1 },
    { x: 0.2, y: 0.2 },
    { x: 0.3, y: 0.3 },
  ],
} as const;
const degenerate = { ...STRAIGHT_LINE, points: [...STRAIGHT_LINE.points] };
const AT = '2026-11-09T15:00:00.000Z';

function setUp(): { h: LibraryMapsHarness; service: MapRegionsService } {
  const h = new LibraryMapsHarness();
  h.maps.rows.push(libraryMapRow({ id: MUNDO_MAP_ID, version: 4 }));
  h.linkTargets.documents.push({
    campaignId: VHARN_ID,
    hiddenByFolder: false,
    id: DIARIO_ID,
    name: 'Diário',
    visibility: 'private',
    ownerIds: [],
    version: 0,
  });
  return { h, service: new MapRegionsService(h.deps) };
}

function withRegion(): ReturnType<typeof setUp> {
  const setup = setUp();
  setup.h.regions.rows.push(mapRegionPo());
  return setup;
}

describe('MapRegionsService.create', () => {
  it('Ana adds a polygon: locks, saves, goes one version up, commits and only then tells', async () => {
    const { h, service } = setUp();
    const region = await service.create(ana, MUNDO_MAP_ID, NEW_REGION);
    expect(region).toMatchObject({ name: 'Reino', geometry: KINGDOM_GEOMETRY, link: null });
    expect(h.journal).toEqual(['lock', 'region:insert', 'bump', 'commit', 'publish']);
    expect(h.maps.rows[0]?.map.version).toBe(5);
  });

  it('adds a pin', async () => {
    const { h, service } = setUp();
    await service.create(ana, MUNDO_MAP_ID, { ...NEW_REGION, geometry: CITY_GEOMETRY });
    expect(h.regions.rows[0]?.geometry).toEqual(CITY_GEOMETRY);
  });

  it('the event has the map and the version, and neither the name nor the geometry', async () => {
    const { h, service } = setUp();
    await service.create(ana, MUNDO_MAP_ID, NEW_REGION);
    expect(h.mapChanges).toStrictEqual([
      { campaignId: VHARN_ID, mapId: MUNDO_MAP_ID, version: 5, at: AT },
    ]);
  });

  it('saves the link in its own column and answers it projected for the master', async () => {
    const { h, service } = setUp();
    const link = { kind: 'document', id: DIARIO_ID } as const;
    const region = await service.create(ana, MUNDO_MAP_ID, { ...NEW_REGION, link });
    expect(h.regions.rows[0]).toMatchObject({ linkKind: 'document', targetDocumentId: DIARIO_ID });
    expect(region.link).toStrictEqual({
      state: 'open',
      kind: 'document',
      id: DIARIO_ID,
      name: 'Diário',
    });
  });

  it('accepts a hidden region and answers it to the master', async () => {
    const { service } = setUp();
    const region = await service.create(ana, MUNDO_MAP_ID, { ...NEW_REGION, hidden: true });
    expect(region.hidden).toBe(true);
  });

  it('refuses the 301st region with MAP_REGIONS_FULL, saving nothing', async () => {
    const { h, service } = setUp();
    h.regions.rows.push(...Array.from({ length: 300 }, () => mapRegionPo()));
    await expect(service.create(ana, MUNDO_MAP_ID, NEW_REGION)).rejects.toMatchObject({
      code: 'MAP_REGIONS_FULL',
    });
    expect(h.journal).toEqual(['lock']);
    expect(h.mapChanges).toEqual([]);
  });

  it('refuses a link to its own map with MAP_LINK_SELF', async () => {
    const { h, service } = setUp();
    const link = { kind: 'map', id: MUNDO_MAP_ID } as const;
    await expect(service.create(ana, MUNDO_MAP_ID, { ...NEW_REGION, link })).rejects.toMatchObject({
      code: 'MAP_LINK_SELF',
    });
    expect(h.journal).toEqual(['lock']);
  });

  it('accepts a link to another map of the table', async () => {
    const { h, service } = setUp();
    h.linkTargets.maps.push({
      campaignId: VHARN_ID,
      hiddenByFolder: false,
      id: MASMORRA_ID,
      name: 'Masmorra',
      visibility: 'private',
      isMain: false,
    });
    const link = { kind: 'map', id: MASMORRA_ID } as const;
    const region = await service.create(ana, MUNDO_MAP_ID, { ...NEW_REGION, link });
    expect(region.link).toMatchObject({ state: 'open', kind: 'map', id: MASMORRA_ID });
  });

  it.each(['document', 'scene', 'map', 'image'] as const)(
    'refuses a %s that is not at the table with MAP_LINK_TARGET_NOT_FOUND',
    async (kind) => {
      const { h, service } = setUp();
      const link = { kind, id: SALAO_ID };
      await expect(
        service.create(ana, MUNDO_MAP_ID, { ...NEW_REGION, link }),
      ).rejects.toMatchObject({ code: 'MAP_LINK_TARGET_NOT_FOUND' });
      expect(h.journal).toEqual(['lock']);
    },
  );

  it('refuses a target of another table as if it did not exist', async () => {
    const { h, service } = setUp();
    h.linkTargets.documents.push({
      hiddenByFolder: false,
      campaignId: QUELM_ID,
      id: SALAO_ID,
      name: 'Quelm',
      visibility: 'public',
      ownerIds: [],
      version: 0,
    });
    const link = { kind: 'document', id: SALAO_ID } as const;
    await expect(service.create(ana, MUNDO_MAP_ID, { ...NEW_REGION, link })).rejects.toMatchObject({
      code: 'MAP_LINK_TARGET_NOT_FOUND',
    });
  });

  it('refuses a polygon with no area, saving nothing', async () => {
    const { h, service } = setUp();
    await expect(
      service.create(ana, MUNDO_MAP_ID, { ...NEW_REGION, geometry: degenerate }),
    ).rejects.toMatchObject({ code: 'MAP_REGION_GEOMETRY_INVALID' });
    expect(h.journal).toEqual(['lock']);
  });

  it('refuses a map the table does not have', async () => {
    const { h, service } = setUp();
    await expect(service.create(ana, SALAO_ID, NEW_REGION)).rejects.toMatchObject({
      code: 'LIBRARY_MAP_NOT_FOUND',
    });
    expect(h.journal).toEqual(['lock']);
  });

  it('refuses Bia with FORBIDDEN before locking anything', async () => {
    const { h, service } = setUp();
    await expect(service.create(bia, MUNDO_MAP_ID, NEW_REGION)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(h.journal).toEqual([]);
  });

  it('answers who is not at the table with CAMPAIGN_NOT_FOUND', async () => {
    const { service } = setUp();
    await expect(service.create(outsider, MUNDO_MAP_ID, NEW_REGION)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
  });

  it('does not tell anybody when saving fails', async () => {
    const { h, service } = setUp();
    h.regions.failSave = true;
    await expect(service.create(ana, MUNDO_MAP_ID, NEW_REGION)).rejects.toThrow('save failed');
    expect(h.journal).toEqual(['lock']);
    expect(h.mapChanges).toEqual([]);
  });
});

describe('MapRegionsService.update', () => {
  it('renames and leaves everything else', async () => {
    const { h, service } = withRegion();
    const region = await service.update(ana, MUNDO_MAP_ID, REINO_REGION_ID, { name: 'Novo' });
    expect(region).toMatchObject({ name: 'Novo', geometry: KINGDOM_GEOMETRY });
    expect(h.journal).toEqual(['lock', 'region:update', 'bump', 'commit', 'publish']);
  });

  it('an update that does not name the link leaves it where it was', async () => {
    const { h, service } = setUp();
    h.regions.rows.push(mapRegionPo({ linkKind: 'document', targetDocumentId: DIARIO_ID }));
    await service.update(ana, MUNDO_MAP_ID, REINO_REGION_ID, { hidden: true });
    expect(h.regions.rows[0]).toMatchObject({ linkKind: 'document', targetDocumentId: DIARIO_ID });
  });

  it('changing the link writes the kind and clears the old target', async () => {
    const { h, service } = setUp();
    h.regions.rows.push(mapRegionPo({ linkKind: 'scene', targetSceneId: SALAO_ID }));
    const link = { kind: 'document', id: DIARIO_ID } as const;
    await service.update(ana, MUNDO_MAP_ID, REINO_REGION_ID, { link });
    expect(h.regions.rows[0]).toMatchObject({
      linkKind: 'document',
      targetDocumentId: DIARIO_ID,
      targetSceneId: null,
      targetMapId: null,
      targetImageId: null,
    });
  });

  describe('a link to a tab', () => {
    const CAPITULO_ID = '9b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
    const link = { kind: 'document', id: DIARIO_ID, tabId: CAPITULO_ID } as const;
    const tabOf = (documentId: string, campaignId: string = VHARN_ID) =>
      ({
        id: CAPITULO_ID,
        campaignId,
        documentId,
        name: 'Capítulo',
        visibility: 'document',
      }) as const;

    it('saves the tab of that document and answers its name', async () => {
      const { h, service } = setUp();
      h.regions.rows.push(mapRegionPo());
      h.linkTargets.documentTabs.push(tabOf(DIARIO_ID));
      const region = await service.update(ana, MUNDO_MAP_ID, REINO_REGION_ID, { link });
      expect(h.regions.rows[0]?.targetDocumentTabId).toBe(CAPITULO_ID);
      expect(region.link).toMatchObject({ tabId: CAPITULO_ID, tabName: 'Capítulo' });
    });

    it('refuses a tab of another document, saving nothing', async () => {
      const { h, service } = setUp();
      h.regions.rows.push(mapRegionPo());
      h.linkTargets.documentTabs.push(tabOf(SALAO_ID));
      await expect(
        service.update(ana, MUNDO_MAP_ID, REINO_REGION_ID, { link }),
      ).rejects.toMatchObject({ code: 'MAP_LINK_TARGET_NOT_FOUND' });
      expect(h.regions.rows[0]?.targetDocumentTabId).toBeNull();
    });

    it('refuses a tab of another table', async () => {
      const { h, service } = setUp();
      h.regions.rows.push(mapRegionPo());
      h.linkTargets.documentTabs.push(tabOf(DIARIO_ID, QUELM_ID));
      await expect(
        service.update(ana, MUNDO_MAP_ID, REINO_REGION_ID, { link }),
      ).rejects.toMatchObject({ code: 'MAP_LINK_TARGET_NOT_FOUND' });
    });
  });

  it('link: null removes the link altogether', async () => {
    const { h, service } = setUp();
    h.regions.rows.push(mapRegionPo({ linkKind: 'document', targetDocumentId: DIARIO_ID }));
    const region = await service.update(ana, MUNDO_MAP_ID, REINO_REGION_ID, { link: null });
    expect(h.regions.rows[0]).toMatchObject({ linkKind: null, targetDocumentId: null });
    expect(region.link).toBeNull();
  });

  it('each edit goes one version up', async () => {
    const { h, service } = withRegion();
    await service.update(ana, MUNDO_MAP_ID, REINO_REGION_ID, { name: 'Um' });
    await service.update(ana, MUNDO_MAP_ID, REINO_REGION_ID, { name: 'Dois' });
    expect(h.mapChanges.map(({ version }) => version)).toEqual([5, 6]);
  });

  it('refuses a polygon with no area', async () => {
    const { h, service } = withRegion();
    await expect(
      service.update(ana, MUNDO_MAP_ID, REINO_REGION_ID, { geometry: degenerate }),
    ).rejects.toMatchObject({ code: 'MAP_REGION_GEOMETRY_INVALID' });
    expect(h.regions.rows[0]?.geometry).toEqual(KINGDOM_GEOMETRY);
  });

  it('refuses a link to its own map', async () => {
    const { service } = withRegion();
    const link = { kind: 'map', id: MUNDO_MAP_ID } as const;
    await expect(
      service.update(ana, MUNDO_MAP_ID, REINO_REGION_ID, { link }),
    ).rejects.toMatchObject({ code: 'MAP_LINK_SELF' });
  });

  it('refuses a target the table does not have', async () => {
    const { service } = withRegion();
    const link = { kind: 'scene', id: SALAO_ID } as const;
    await expect(
      service.update(ana, MUNDO_MAP_ID, REINO_REGION_ID, { link }),
    ).rejects.toMatchObject({ code: 'MAP_LINK_TARGET_NOT_FOUND' });
  });

  it('refuses a region the map does not have with MAP_REGION_NOT_FOUND, telling nobody', async () => {
    const { h, service } = setUp();
    await expect(
      service.update(ana, MUNDO_MAP_ID, REINO_REGION_ID, { name: 'Novo' }),
    ).rejects.toMatchObject({ code: 'MAP_REGION_NOT_FOUND' });
    expect(h.mapChanges).toEqual([]);
  });

  it('refuses Bia with FORBIDDEN before locking anything', async () => {
    const { h, service } = withRegion();
    await expect(
      service.update(bia, MUNDO_MAP_ID, REINO_REGION_ID, { name: 'Bia' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(h.journal).toEqual([]);
  });
});

describe('MapRegionsService.delete', () => {
  it('removes the region, goes one version up and tells after the commit', async () => {
    const { h, service } = withRegion();
    await service.delete(ana, MUNDO_MAP_ID, REINO_REGION_ID);
    expect(h.regions.rows).toEqual([]);
    expect(h.journal).toEqual(['lock', 'region:delete', 'bump', 'commit', 'publish']);
    expect(h.mapChanges).toMatchObject([{ mapId: MUNDO_MAP_ID, version: 5 }]);
  });

  it('refuses a region the map does not have with MAP_REGION_NOT_FOUND', async () => {
    const { h, service } = setUp();
    await expect(service.delete(ana, MUNDO_MAP_ID, REINO_REGION_ID)).rejects.toMatchObject({
      code: 'MAP_REGION_NOT_FOUND',
    });
    expect(h.mapChanges).toEqual([]);
  });

  it('refuses Bia with FORBIDDEN', async () => {
    const { h, service } = withRegion();
    await expect(service.delete(bia, MUNDO_MAP_ID, REINO_REGION_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(h.regions.rows).toHaveLength(1);
  });
});
