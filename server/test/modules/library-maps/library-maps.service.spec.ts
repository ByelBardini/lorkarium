import { describe, expect, it } from 'vitest';
import { LibraryMapsService } from '../../../src/modules/library-maps/library-maps.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { sceneFolderPo } from '../../support/library-factories';
import { LibraryMapsHarness } from '../../support/library-maps-fakes';
import {
  MAP_ART_ID,
  MUNDO_MAP_ID,
  libraryMapRow,
  mapRegionPo,
} from '../../support/library-maps-factories';

const ana = { userId: ANA_ID, campaignId: VHARN_ID };
const bia = { userId: BIA_ID, campaignId: VHARN_ID };
const outsider = { userId: CAIO_ID, campaignId: VHARN_ID };
const MASMORRA_ID = '6b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const ATLAS_ID = '7b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const NEW_MAP = { name: 'Mundo', assetId: MAP_ART_ID };

function harnessWith(...rows: ReturnType<typeof libraryMapRow>[]): {
  h: LibraryMapsHarness;
  service: LibraryMapsService;
} {
  const h = new LibraryMapsHarness();
  h.maps.rows.push(...rows);
  return { h, service: new LibraryMapsService(h.deps) };
}

const mundo = (changes = {}) => libraryMapRow({ id: MUNDO_MAP_ID, ...changes });
const masmorra = (changes = {}) =>
  libraryMapRow({ id: MASMORRA_ID, name: 'Masmorra', assetId: MASMORRA_ID, ...changes });

describe('LibraryMapsService.create', () => {
  it('Ana creates a private map that is not the main one, and it is announced after the commit', async () => {
    const { h, service } = harnessWith();
    const map = await service.create(ana, NEW_MAP);
    expect(map).toMatchObject({ name: 'Mundo', visibility: 'private', isMain: false });
    expect(h.journal).toEqual(['lock', 'insert', 'commit', 'publish']);
    expect(h.events).toEqual([{ campaignId: VHARN_ID, at: '2026-11-09T15:00:00.000Z' }]);
  });

  it('keeps the folder and the visibility it was told', async () => {
    const { h, service } = harnessWith();
    h.folders.rows.push(sceneFolderPo({ id: ATLAS_ID, campaignId: VHARN_ID }));
    const map = await service.create(ana, { ...NEW_MAP, folderId: ATLAS_ID, visibility: 'public' });
    expect(map).toMatchObject({ folderId: ATLAS_ID, visibility: 'public' });
  });

  it('refuses a folder the table does not have, saving and announcing nothing', async () => {
    const { h, service } = harnessWith();
    await expect(service.create(ana, { ...NEW_MAP, folderId: ATLAS_ID })).rejects.toMatchObject({
      code: 'FOLDER_NOT_FOUND',
    });
    expect(h.journal).toEqual(['lock']);
  });

  it('refuses an image another map already uses as ASSET_NOT_FOUND', async () => {
    const { h, service } = harnessWith(mundo({ assetId: MAP_ART_ID }));
    await expect(service.create(ana, NEW_MAP)).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' });
    expect(h.journal).toEqual(['lock']);
  });

  it('refuses an image sent for something else as ASSET_NOT_FOUND', async () => {
    const { h, service } = harnessWith();
    const asset = h.assets.rows[0];
    if (asset) asset.purpose = 'library_image';
    await expect(service.create(ana, NEW_MAP)).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' });
  });

  it('does not announce when saving fails', async () => {
    const { h, service } = harnessWith();
    h.maps.failSave = true;
    await expect(service.create(ana, NEW_MAP)).rejects.toThrow('save failed');
    expect(h.journal).toEqual(['lock']);
  });

  it('refuses Bia with FORBIDDEN before locking anything', async () => {
    const { h, service } = harnessWith();
    await expect(service.create(bia, NEW_MAP)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(h.journal).toEqual([]);
  });

  it('answers who is not at the table with CAMPAIGN_NOT_FOUND', async () => {
    const { h, service } = harnessWith();
    await expect(service.create(outsider, NEW_MAP)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
    expect(h.journal).toEqual([]);
  });
});

describe('LibraryMapsService.detail', () => {
  it('gives Ana a private map', async () => {
    const { service } = harnessWith(mundo());
    await expect(service.detail(ana, MUNDO_MAP_ID)).resolves.toMatchObject({
      id: MUNDO_MAP_ID,
      regions: [],
    });
  });

  it('gives Bia the private map while it is the main one', async () => {
    const { service } = harnessWith(mundo({ isMain: true }));
    await expect(service.detail(bia, MUNDO_MAP_ID)).resolves.toMatchObject({ id: MUNDO_MAP_ID });
  });

  it('answers Bia on a private map with LIBRARY_MAP_NOT_FOUND, never FORBIDDEN', async () => {
    const { service } = harnessWith(mundo());
    await expect(service.detail(bia, MUNDO_MAP_ID)).rejects.toMatchObject({
      code: 'LIBRARY_MAP_NOT_FOUND',
    });
  });

  it('does not find a map of another table', async () => {
    const { service } = harnessWith(mundo({ campaignId: MASMORRA_ID, visibility: 'public' }));
    await expect(service.detail(ana, MUNDO_MAP_ID)).rejects.toMatchObject({
      code: 'LIBRARY_MAP_NOT_FOUND',
    });
  });

  it('answers who is not at the table with CAMPAIGN_NOT_FOUND', async () => {
    const { service } = harnessWith(mundo({ visibility: 'public' }));
    await expect(service.detail(outsider, MUNDO_MAP_ID)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
  });
});

describe('LibraryMapsService.main', () => {
  it('gives Bia the summary of the main map, even a private one', async () => {
    const { service } = harnessWith(mundo(), masmorra({ isMain: true }));
    await expect(service.main(bia)).resolves.toMatchObject({ map: { id: MASMORRA_ID } });
  });

  it('answers map: null when the table has no main map', async () => {
    const { service } = harnessWith(mundo());
    await expect(service.main(bia)).resolves.toEqual({ map: null });
  });

  it('answers who is not at the table with CAMPAIGN_NOT_FOUND', async () => {
    const { service } = harnessWith(mundo({ isMain: true }));
    await expect(service.main(outsider)).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
  });
});

describe('LibraryMapsService.update', () => {
  it('saves, bumps the version and announces after the commit', async () => {
    const { h, service } = harnessWith(mundo());
    const map = await service.update(ana, MUNDO_MAP_ID, { name: 'Vharn' });
    expect(map).toMatchObject({ name: 'Vharn', version: 1 });
    expect(h.journal).toEqual(['lock', 'update', 'bump', 'commit', 'publish']);
  });

  it('moves the map to the root without asking for a folder', async () => {
    const { service } = harnessWith(mundo({ folderId: ATLAS_ID }));
    const map = await service.update(ana, MUNDO_MAP_ID, { folderId: null });
    expect(map.folderId).toBeNull();
  });

  it('refuses a folder the table does not have', async () => {
    const { h, service } = harnessWith(mundo());
    await expect(service.update(ana, MUNDO_MAP_ID, { folderId: ATLAS_ID })).rejects.toMatchObject({
      code: 'FOLDER_NOT_FOUND',
    });
    expect(h.journal).toEqual(['lock']);
  });

  it('answers an unknown map with LIBRARY_MAP_NOT_FOUND and announces nothing', async () => {
    const { h, service } = harnessWith();
    await expect(service.update(ana, MUNDO_MAP_ID, { name: 'Vharn' })).rejects.toMatchObject({
      code: 'LIBRARY_MAP_NOT_FOUND',
    });
    expect(h.journal).not.toContain('publish');
    expect(h.journal).not.toContain('bump');
  });

  it('refuses Bia with FORBIDDEN before locking anything', async () => {
    const { h, service } = harnessWith(mundo());
    await expect(service.update(bia, MUNDO_MAP_ID, { name: 'Vharn' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(h.journal).toEqual([]);
  });
});

describe('LibraryMapsService.delete', () => {
  it('deletes a map that is not the main one and announces after the commit', async () => {
    const { h, service } = harnessWith(mundo());
    await service.delete(ana, MUNDO_MAP_ID);
    expect(h.maps.rows).toEqual([]);
    expect(h.journal).toEqual(['lock', 'delete', 'commit', 'publish']);
  });

  it('refuses the main map with MAP_IS_MAIN, deleting and announcing nothing', async () => {
    const { h, service } = harnessWith(mundo({ isMain: true }));
    await expect(service.delete(ana, MUNDO_MAP_ID)).rejects.toMatchObject({ code: 'MAP_IS_MAIN' });
    expect(h.maps.rows).toHaveLength(1);
    expect(h.journal).toEqual(['lock']);
  });

  it('answers an unknown map with LIBRARY_MAP_NOT_FOUND', async () => {
    const { service } = harnessWith();
    await expect(service.delete(ana, MUNDO_MAP_ID)).rejects.toMatchObject({
      code: 'LIBRARY_MAP_NOT_FOUND',
    });
  });

  it('refuses Bia with FORBIDDEN before locking anything', async () => {
    const { h, service } = harnessWith(mundo());
    await expect(service.delete(bia, MUNDO_MAP_ID)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(h.journal).toEqual([]);
  });
});

describe('LibraryMapsService.setMain', () => {
  it('swaps the main map in one transaction: lock, unset, set, commit, publish', async () => {
    const old = masmorra({ isMain: true });
    const { h, service } = harnessWith(mundo(), old);
    const map = await service.setMain(ana, MUNDO_MAP_ID);
    expect(map.isMain).toBe(true);
    expect(old.map.isMain).toBe(false);
    expect(h.journal).toEqual(['lock', 'unset', 'set', 'commit', 'publish']);
  });

  it('saves and announces nothing when the map already is the main one', async () => {
    const { h, service } = harnessWith(mundo({ isMain: true }));
    const map = await service.setMain(ana, MUNDO_MAP_ID);
    expect(map.isMain).toBe(true);
    expect(h.journal).toEqual(['lock', 'commit']);
  });

  it('leaves the current main map when the new one is unknown', async () => {
    const old = masmorra({ isMain: true });
    const { h, service } = harnessWith(old);
    await expect(service.setMain(ana, MUNDO_MAP_ID)).rejects.toMatchObject({
      code: 'LIBRARY_MAP_NOT_FOUND',
    });
    expect(old.map.isMain).toBe(true);
    expect(h.journal).toEqual(['lock']);
  });

  it('does not announce when saving fails', async () => {
    const { h, service } = harnessWith(mundo());
    h.maps.failSave = true;
    await expect(service.setMain(ana, MUNDO_MAP_ID)).rejects.toThrow('save failed');
    expect(h.journal).toEqual(['lock', 'unset']);
  });

  it('refuses Bia with FORBIDDEN before locking anything', async () => {
    const { h, service } = harnessWith(mundo());
    await expect(service.setMain(bia, MUNDO_MAP_ID)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(h.journal).toEqual([]);
  });
});

describe('LibraryMapsService.unsetMain', () => {
  it('leaves the table without a main map and announces after the commit', async () => {
    const { h, service } = harnessWith(mundo({ isMain: true }));
    const map = await service.unsetMain(ana, MUNDO_MAP_ID);
    expect(map.isMain).toBe(false);
    expect(h.journal).toEqual(['lock', 'unset', 'commit', 'publish']);
  });

  it('does not take the main mark from another map', async () => {
    const old = masmorra({ isMain: true });
    const { h, service } = harnessWith(mundo(), old);
    await service.unsetMain(ana, MUNDO_MAP_ID);
    expect(old.map.isMain).toBe(true);
    expect(h.journal).toEqual(['lock', 'commit']);
  });

  it('refuses Bia with FORBIDDEN before locking anything', async () => {
    const { h, service } = harnessWith(mundo({ isMain: true }));
    await expect(service.unsetMain(bia, MUNDO_MAP_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(h.journal).toEqual([]);
  });
});

describe('LibraryMapsService.detail regions', () => {
  const DIARIO_ID = '9f2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
  const OTHER_REGION_ID = '9e2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
  const diario = {
    campaignId: VHARN_ID,
    id: DIARIO_ID,
    name: 'Diário',
    visibility: 'private',
    hiddenByFolder: false,
    ownerIds: [],
    version: 0,
  } as const;
  const linked = (id: string, hidden = false) =>
    mapRegionPo({ id, hidden, linkKind: 'document', targetDocumentId: DIARIO_ID });

  function publicMapWithRegions(): ReturnType<typeof harnessWith> {
    const setup = harnessWith(mundo({ visibility: 'public' }));
    setup.h.linkTargets.documents.push(diario);
    setup.h.regions.rows.push(
      linked(OTHER_REGION_ID, true),
      linked('9d2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'),
    );
    return setup;
  }

  it('Bia gets the visible region alone, with the private document locked', async () => {
    const { service } = publicMapWithRegions();
    const { regions } = await service.detail(bia, MUNDO_MAP_ID);
    expect(regions.map(({ link }) => link)).toStrictEqual([{ state: 'locked' }]);
  });

  it('Ana gets both, with the document open', async () => {
    const { service } = publicMapWithRegions();
    const { regions } = await service.detail(ana, MUNDO_MAP_ID);
    expect(regions.map(({ link }) => link)).toStrictEqual([
      { state: 'open', kind: 'document', id: DIARIO_ID, name: 'Diário' },
      { state: 'open', kind: 'document', id: DIARIO_ID, name: 'Diário' },
    ]);
  });

  it('asks for the documents once however many regions point at them', async () => {
    const { h, service } = publicMapWithRegions();
    await service.detail(ana, MUNDO_MAP_ID);
    expect(h.linkTargets.lookups).toEqual(['documents']);
  });

  it('reads no region of a map the reader may not see', async () => {
    const { h, service } = harnessWith(mundo());
    h.regions.rows.push(linked(OTHER_REGION_ID));
    await expect(service.detail(bia, MUNDO_MAP_ID)).rejects.toMatchObject({
      code: 'LIBRARY_MAP_NOT_FOUND',
    });
    expect(h.linkTargets.lookups).toEqual([]);
  });
});

describe("LibraryMapsService.create and the owner's plan", () => {
  const free = { role: 'user', plan: 'free', lorkariumOwner: false } as const;

  it('a free table with 1 map refuses the 2nd as PLAN_LIMIT libraryMaps, saving nothing', async () => {
    const { h, service } = harnessWith(masmorra());
    h.campaigns.owner = free;
    await expect(service.create(ana, NEW_MAP)).rejects.toMatchObject({
      code: 'PLAN_LIMIT',
      resource: 'libraryMaps',
      stored: 1,
      limit: 1,
      plan: 'free',
    });
    expect(h.journal).toEqual(['lock']);
  });

  it('a free table creates its first map', async () => {
    const { h, service } = harnessWith();
    h.campaigns.owner = free;
    await expect(service.create(ana, NEW_MAP)).resolves.toMatchObject({ name: 'Mundo' });
  });

  it('the maps of another table do not count for Vharn', async () => {
    const other = '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
    const { h, service } = harnessWith(masmorra({ campaignId: other }));
    h.campaigns.owner = free;
    await expect(service.create(ana, NEW_MAP)).resolves.toMatchObject({ name: 'Mundo' });
  });
});
