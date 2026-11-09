import { describe, expect, it } from 'vitest';
import { MapRegionShowService } from '../../../src/modules/library-maps/map-region-show.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { LibraryMapsHarness, SHOW_EVENT_ID } from '../../support/library-maps-fakes';
import {
  MUNDO_MAP_ID,
  REINO_REGION_ID,
  libraryMapRow,
  mapRegionPo,
} from '../../support/library-maps-factories';

const ana = { userId: ANA_ID, campaignId: VHARN_ID };
const bia = { userId: BIA_ID, campaignId: VHARN_ID };
const outsider = { userId: CAIO_ID, campaignId: VHARN_ID };

type MapChanges = Parameters<typeof libraryMapRow>[0];

function setUp(
  map: MapChanges = { visibility: 'public' },
  region = mapRegionPo(),
): { h: LibraryMapsHarness; service: MapRegionShowService } {
  const h = new LibraryMapsHarness();
  h.maps.rows.push(libraryMapRow({ id: MUNDO_MAP_ID, version: 4, ...map }));
  h.regions.rows.push(region);
  return { h, service: new MapRegionShowService(h.deps) };
}

describe('MapRegionShowService.show', () => {
  it('Ana shows a region: the table is told, with no name and no geometry', async () => {
    const { h, service } = setUp();
    await service.show(ana, MUNDO_MAP_ID, REINO_REGION_ID);
    expect(h.regionsShown).toStrictEqual([
      {
        eventId: SHOW_EVENT_ID,
        campaignId: VHARN_ID,
        mapId: MUNDO_MAP_ID,
        regionId: REINO_REGION_ID,
        at: '2026-11-09T15:00:00.000Z',
      },
    ]);
  });

  it('saves nothing, takes no lock and leaves the version where it was', async () => {
    const { h, service } = setUp();
    await service.show(ana, MUNDO_MAP_ID, REINO_REGION_ID);
    expect(h.journal).toEqual(['publish']);
    expect(h.maps.rows[0]?.map.version).toBe(4);
  });

  it('a private main map can be shown', async () => {
    const { h, service } = setUp({ visibility: 'private', isMain: true });
    await service.show(ana, MUNDO_MAP_ID, REINO_REGION_ID);
    expect(h.regionsShown).toHaveLength(1);
  });

  it('refuses a hidden region with MAP_REGION_NOT_SHOWABLE, telling nobody', async () => {
    const { h, service } = setUp({ visibility: 'public' }, mapRegionPo({ hidden: true }));
    await expect(service.show(ana, MUNDO_MAP_ID, REINO_REGION_ID)).rejects.toMatchObject({
      code: 'MAP_REGION_NOT_SHOWABLE',
    });
    expect(h.regionsShown).toEqual([]);
  });

  it('refuses a private map that is not the main one, telling nobody', async () => {
    const { h, service } = setUp({ visibility: 'private' });
    await expect(service.show(ana, MUNDO_MAP_ID, REINO_REGION_ID)).rejects.toMatchObject({
      code: 'MAP_REGION_NOT_SHOWABLE',
    });
    expect(h.regionsShown).toEqual([]);
  });

  it('refuses a region the map does not have with MAP_REGION_NOT_FOUND', async () => {
    const { h, service } = setUp();
    h.regions.rows.length = 0;
    await expect(service.show(ana, MUNDO_MAP_ID, REINO_REGION_ID)).rejects.toMatchObject({
      code: 'MAP_REGION_NOT_FOUND',
    });
  });

  it('refuses a map the table does not have with LIBRARY_MAP_NOT_FOUND', async () => {
    const { h, service } = setUp();
    h.maps.rows.length = 0;
    await expect(service.show(ana, MUNDO_MAP_ID, REINO_REGION_ID)).rejects.toMatchObject({
      code: 'LIBRARY_MAP_NOT_FOUND',
    });
  });

  it('refuses Bia with FORBIDDEN, telling nobody', async () => {
    const { h, service } = setUp();
    await expect(service.show(bia, MUNDO_MAP_ID, REINO_REGION_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(h.regionsShown).toEqual([]);
  });

  it('answers who is not at the table with CAMPAIGN_NOT_FOUND', async () => {
    const { service } = setUp();
    await expect(service.show(outsider, MUNDO_MAP_ID, REINO_REGION_ID)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
  });
});
