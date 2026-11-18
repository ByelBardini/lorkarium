import { describe, expect, it } from 'vitest';
import { LibraryMapsService } from '../../../src/modules/library-maps/library-maps.service';
import { MapRegionsService } from '../../../src/modules/library-maps/map-regions.service';
import { ANA_ID } from '../../support/auth-factories';
import { VHARN_ID } from '../../support/campaigns-factories';
import { LibraryMapsHarness } from '../../support/library-maps-fakes';
import {
  KINGDOM_GEOMETRY,
  MUNDO_MAP_ID,
  REINO_REGION_ID,
  libraryMapRow,
  mapRegionPo,
} from '../../support/library-maps-factories';
import { planAccount } from '../../support/plan-account-fakes';
import type { UserPlan } from '@lorkarium/contracts';

const ana = { userId: ANA_ID, campaignId: VHARN_ID };
const CIDADE_MAP_ID = '5b5b5b5b-5b5b-4b5b-8b5b-000000000002';
const NEW_REGION = {
  name: 'Reino',
  description: '',
  geometry: KINGDOM_GEOMETRY,
  color: '#aa3300',
  icon: 'pin',
  hidden: false,
  link: null,
} as const;

const readOnly = (position: number, limit: number) =>
  expect.objectContaining({
    code: 'PLAN_LIMIT',
    reason: 'readOnly',
    resource: 'libraryMaps',
    stored: position,
    limit,
  });

// Mundo and then Cidade, made while the owner could; now the owner is on `plan`.
function tableOn(plan: UserPlan): LibraryMapsHarness {
  const h = new LibraryMapsHarness();
  h.maps.rows.push(libraryMapRow({ id: MUNDO_MAP_ID }), libraryMapRow({ id: CIDADE_MAP_ID }));
  h.regions.rows.push(mapRegionPo({ mapId: MUNDO_MAP_ID }));
  h.campaigns.owner = planAccount({ plan });
  return h;
}

describe('the maps of a table fallen to free (no map allowed)', () => {
  it('renaming the oldest map is refused with PLAN_LIMIT readOnly, nothing saved nor published', async () => {
    const h = tableOn('free');

    const update = new LibraryMapsService(h.deps).update(ana, MUNDO_MAP_ID, { name: 'Novo' });

    await expect(update).rejects.toThrow(readOnly(1, 0));
    expect(h.journal).toEqual(['lock']);
    expect(h.events).toEqual([]);
  });

  it.each([
    ['creating a region', (s: MapRegionsService) => s.create(ana, MUNDO_MAP_ID, NEW_REGION)],
    [
      'editing a region',
      (s: MapRegionsService) => s.update(ana, MUNDO_MAP_ID, REINO_REGION_ID, { hidden: true }),
    ],
    ['deleting a region', (s: MapRegionsService) => s.delete(ana, MUNDO_MAP_ID, REINO_REGION_ID)],
  ])('%s is refused with PLAN_LIMIT readOnly, without a new version', async (_, write) => {
    const h = tableOn('free');

    await expect(write(new MapRegionsService(h.deps))).rejects.toThrow(readOnly(1, 0));
    expect(h.mapChanges).toEqual([]);
    expect(h.regions.rows).toHaveLength(1);
  });

  it('marking the map as main passes, and its summary says planLocked', async () => {
    const h = tableOn('free');

    const marked = await new LibraryMapsService(h.deps).setMain(ana, CIDADE_MAP_ID);

    expect(marked).toMatchObject({ id: CIDADE_MAP_ID, isMain: true, planLocked: true });
  });

  it('deleting a map passes', async () => {
    const h = tableOn('free');

    await new LibraryMapsService(h.deps).delete(ana, CIDADE_MAP_ID);

    expect(h.maps.rows.map(({ map }) => map.id)).toEqual([MUNDO_MAP_ID]);
  });

  it('the detail and the main map carry planLocked', async () => {
    const h = tableOn('free');
    h.maps.rows[0]!.map.isMain = true;
    const service = new LibraryMapsService(h.deps);

    const detail = await service.detail(ana, CIDADE_MAP_ID);
    const { map } = await service.main(ana);

    expect([detail.planLocked, map?.planLocked]).toEqual([true, true]);
  });
});

describe('the maps of a narrador table (3 maps)', () => {
  it('renaming the 2nd map passes and its summary is not locked', async () => {
    const h = tableOn('narrador');

    const renamed = await new LibraryMapsService(h.deps).update(ana, CIDADE_MAP_ID, {
      name: 'Porto',
    });

    expect(renamed).toMatchObject({ name: 'Porto', planLocked: false });
  });
});
