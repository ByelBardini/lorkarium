import { describe, expect, it } from 'vitest';
import { MapAppearancesService } from '../../../src/modules/library-maps/map-appearances.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';
import { DOCUMENT_ID, documentPo } from '../../support/documents-fakes';
import { LibraryMapsHarness, type MapAppearanceFixture } from '../../support/library-maps-fakes';
import { MUNDO_MAP_ID, REINO_REGION_ID } from '../../support/library-maps-factories';

const ana = { userId: ANA_ID, campaignId: VHARN_ID };
const bia = { userId: BIA_ID, campaignId: VHARN_ID };
const outsider = { userId: CAIO_ID, campaignId: VHARN_ID };
const CIDADE_ID = '9f2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

function appearance(changes: Partial<MapAppearanceFixture> = {}): MapAppearanceFixture {
  return {
    campaignId: VHARN_ID,
    documentId: DOCUMENT_ID,
    mapId: MUNDO_MAP_ID,
    mapName: 'Mundo',
    mapVisibility: 'public',
    mapIsMain: false,
    mapHiddenByFolder: false,
    regionId: REINO_REGION_ID,
    regionName: 'Reino',
    regionHidden: false,
    tabName: null,
    tabVisibility: null,
    ...changes,
  };
}

const PLACE = {
  mapId: MUNDO_MAP_ID,
  mapName: 'Mundo',
  regionId: REINO_REGION_ID,
  regionName: 'Reino',
  tabName: null,
};

function setUp(
  visibility: 'public' | 'private',
  ...rows: MapAppearanceFixture[]
): { h: LibraryMapsHarness; service: MapAppearancesService } {
  const h = new LibraryMapsHarness();
  h.documents.rows.push(documentPo({ visibility }));
  h.regions.appearances.push(...rows);
  return { h, service: new MapAppearancesService(h.deps) };
}

describe('MapAppearancesService.list', () => {
  it('answers the map and the region, and only what the DTO has', async () => {
    const { service } = setUp('public', appearance());
    await expect(service.list(bia, DOCUMENT_ID)).resolves.toStrictEqual({ appearances: [PLACE] });
  });

  it('Ana sees a hidden region and a private map too', async () => {
    const hidden = appearance({ regionHidden: true });
    const secret = appearance({ regionId: CIDADE_ID, mapVisibility: 'private' });
    const { service } = setUp('private', hidden, secret);
    const { appearances } = await service.list(ana, DOCUMENT_ID);
    expect(appearances.map(({ regionId }) => regionId)).toEqual([REINO_REGION_ID, CIDADE_ID]);
  });

  it('names the tab the region points at', async () => {
    const row = appearance({ tabName: 'Capítulo', tabVisibility: 'document' });
    const { service } = setUp('public', row);
    await expect(service.list(bia, DOCUMENT_ID)).resolves.toStrictEqual({
      appearances: [{ ...PLACE, tabName: 'Capítulo' }],
    });
  });

  it('Bia does not see a region linked to a masters-only tab, and Ana does', async () => {
    const row = appearance({ tabName: 'Segredos', tabVisibility: 'masters' });
    const { service } = setUp('public', row);
    await expect(service.list(bia, DOCUMENT_ID)).resolves.toEqual({ appearances: [] });
    const { appearances } = await service.list(ana, DOCUMENT_ID);
    expect(appearances.map(({ tabName }) => tabName)).toEqual(['Segredos']);
  });

  it('Bia does not see a hidden region', async () => {
    const { service } = setUp('public', appearance({ regionHidden: true }));
    await expect(service.list(bia, DOCUMENT_ID)).resolves.toEqual({ appearances: [] });
  });

  it('Bia does not see a private map that is not the main one', async () => {
    const { service } = setUp('public', appearance({ mapVisibility: 'private' }));
    await expect(service.list(bia, DOCUMENT_ID)).resolves.toEqual({ appearances: [] });
  });

  it('Bia sees a private map while it is the main one', async () => {
    const { service } = setUp('public', appearance({ mapVisibility: 'private', mapIsMain: true }));
    await expect(service.list(bia, DOCUMENT_ID)).resolves.toEqual({ appearances: [PLACE] });
  });

  it('the player who owns a private document can list it', async () => {
    const { h, service } = setUp('private', appearance());
    h.documents.ownerRows[DOCUMENT_ID] = [BIA_ID];
    await expect(service.list(bia, DOCUMENT_ID)).resolves.toEqual({ appearances: [PLACE] });
  });

  it('a document Bia does not read is DOCUMENT_NOT_FOUND, even with places on public maps', async () => {
    const { service } = setUp('private', appearance());
    await expect(service.list(bia, DOCUMENT_ID)).rejects.toMatchObject({
      code: 'DOCUMENT_NOT_FOUND',
    });
  });

  it('a document that does not exist is DOCUMENT_NOT_FOUND', async () => {
    const { h, service } = setUp('public');
    h.documents.rows.length = 0;
    await expect(service.list(ana, DOCUMENT_ID)).rejects.toMatchObject({
      code: 'DOCUMENT_NOT_FOUND',
    });
  });

  it('a document of another table is DOCUMENT_NOT_FOUND', async () => {
    const { h, service } = setUp('public');
    h.documents.rows.length = 0;
    h.documents.rows.push(documentPo({ campaignId: QUELM_ID, visibility: 'public' }));
    await expect(service.list(ana, DOCUMENT_ID)).rejects.toMatchObject({
      code: 'DOCUMENT_NOT_FOUND',
    });
  });

  it('answers who is not at the table with CAMPAIGN_NOT_FOUND', async () => {
    const { service } = setUp('public', appearance());
    await expect(service.list(outsider, DOCUMENT_ID)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
  });
});
