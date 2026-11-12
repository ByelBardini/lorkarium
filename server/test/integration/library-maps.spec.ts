import {
  campaignLibraryDto,
  libraryMapDetailDto,
  libraryMapSummaryDto,
  mainMapResponseDto,
  type CampaignLibraryDto,
  type LibraryMapSummaryDto,
} from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { AssetsDao } from '../../src/modules/assets/assets.dao';
import { SceneFoldersDao } from '../../src/modules/library/scene-folders.dao';
import { newAssetPo } from '../support/assets-factories';
import { silence } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { setAccountPlan } from '../support/account-plans';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
// Vharn as it was before the plans: its owner has no plan limit.
beforeEach(() => setAccountPlan(live.connection.db, live.ana.id, 'amigo_do_dono'));

const mapsUrl = (table: Table = live.vharn): string => `/api/campaigns/${table.id}/library-maps`;
const mapUrl = (mapId: string, table: Table = live.vharn): string => `${mapsUrl(table)}/${mapId}`;
const mainUrl = (mapId: string): string => `${mapUrl(mapId)}/main`;

async function mapAssetId(table: Table = live.vharn, purpose = 'library_map'): Promise<string> {
  const row = newAssetPo({ campaignId: table.id, purpose: purpose as 'library_map' });
  return (await new AssetsDao(live.connection.db).insert(row)).id;
}

async function createMap(overrides: object = {}): Promise<LibraryMapSummaryDto> {
  const payload = { name: '  Mundo  ', assetId: await mapAssetId(), ...overrides };
  const response = await live.http(live.ana, { method: 'POST', url: mapsUrl(), payload });
  expect(response.statusCode, response.body).toBe(201);
  return libraryMapSummaryDto.parse(response.json());
}

async function libraryOf(
  user: SignedInUser,
  table: Table = live.vharn,
): Promise<CampaignLibraryDto> {
  const url = `/api/campaigns/${table.id}/library`;
  const response = await live.http(user, { method: 'GET', url });
  expect(response.statusCode, response.body).toBe(200);
  return campaignLibraryDto.parse(response.json());
}

function readMap(user: SignedInUser, mapId: string, table: Table = live.vharn) {
  return live.http(user, { method: 'GET', url: mapUrl(mapId, table) });
}

function setMain(user: SignedInUser, mapId: string) {
  return live.http(user, { method: 'PUT', url: mainUrl(mapId) });
}

function unsetMain(user: SignedInUser, mapId: string) {
  return live.http(user, { method: 'DELETE', url: mainUrl(mapId) });
}

function addFolder(table: Table, name: string, parentId: string | null = null): Promise<string> {
  const folders = new SceneFoldersDao(live.connection.db);
  return folders.insert({ campaignId: table.id, name, parentId }).then((folder) => folder.id);
}

describe('a map of the library over HTTP', () => {
  it('Ana creates a private map that is not the main one; the name comes trimmed', async () => {
    const map = await createMap();

    expect(map).toMatchObject({
      name: 'Mundo',
      folderId: null,
      visibility: 'private',
      isMain: false,
      version: 0,
    });
  });

  it('Ana reads the detail, with no regions and no cache', async () => {
    const map = await createMap();

    const response = await readMap(live.ana, map.id);

    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(libraryMapDetailDto.parse(response.json())).toMatchObject({ id: map.id, regions: [] });
  });

  it('a change of name, folder or visibility is saved and goes one version up', async () => {
    const map = await createMap();
    const folderId = await addFolder(live.vharn, 'Atlas');
    const payload = { name: 'Vharn', folderId, visibility: 'public' };

    const response = await live.http(live.ana, { method: 'PATCH', url: mapUrl(map.id), payload });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ ...payload, version: 1 });
  });

  it('a public map reaches Bia and the spectator', async () => {
    const map = await createMap({ visibility: 'public' });
    const duda = await live.signUp('Duda');
    await live.joinAsSpectator(duda, live.vharn);

    expect((await readMap(live.bia, map.id)).statusCode).toBe(200);
    expect((await readMap(duda, map.id)).statusCode).toBe(200);
  });

  it('a private map that is not the main one is 404 LIBRARY_MAP_NOT_FOUND for Bia, never 403', async () => {
    const map = await createMap();

    const response = await readMap(live.bia, map.id);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'LIBRARY_MAP_NOT_FOUND' });
  });

  it('deleting takes the map out of the library', async () => {
    const map = await createMap();

    const response = await live.http(live.ana, { method: 'DELETE', url: mapUrl(map.id) });

    expect(response.statusCode).toBe(204);
    expect((await libraryOf(live.ana)).maps).toEqual([]);
  });
});

describe('the main map', () => {
  it('marking another map swaps the main one, in the library and in GET main', async () => {
    const mundo = await createMap();
    const masmorra = await createMap({ name: 'Masmorra' });
    await setMain(live.ana, mundo.id);

    const response = await setMain(live.ana, masmorra.id);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ id: masmorra.id, isMain: true });
    const library = await libraryOf(live.ana);
    expect(library.mainMapId).toBe(masmorra.id);
    expect(library.maps.filter((map) => map.isMain).map((map) => map.id)).toEqual([masmorra.id]);
    const main = await live.http(live.bia, { method: 'GET', url: `${mapsUrl()}/main` });
    expect(mainMapResponseDto.parse(main.json()).map?.id).toBe(masmorra.id);
  });

  it('GET main answers map: null at a table without a main map', async () => {
    const response = await live.http(live.bia, { method: 'GET', url: `${mapsUrl()}/main` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ map: null });
  });

  it('a private main map reaches Bia with the folders that lead to it', async () => {
    const atlas = await addFolder(live.vharn, 'Atlas');
    const reinos = await addFolder(live.vharn, 'Reinos', atlas);
    const map = await createMap({ folderId: reinos });
    await setMain(live.ana, map.id);

    const library = await libraryOf(live.bia);

    expect(library.mainMapId).toBe(map.id);
    expect(library.maps.map(({ id }) => id)).toEqual([map.id]);
    expect(library.folders.map(({ id }) => id).sort()).toEqual([atlas, reinos].sort());
    expect((await readMap(live.bia, map.id)).statusCode).toBe(200);
  });

  it('unmarking leaves no main map and the map back to its own visibility', async () => {
    const atlas = await addFolder(live.vharn, 'Atlas');
    const map = await createMap({ folderId: atlas });
    await setMain(live.ana, map.id);

    const response = await unsetMain(live.ana, map.id);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ isMain: false });
    const library = await libraryOf(live.bia);
    expect(library).toMatchObject({ mainMapId: null, maps: [], folders: [] });
    expect((await readMap(live.bia, map.id)).statusCode).toBe(404);
  });

  it('the main map cannot be deleted: 409 MAP_IS_MAIN, and it stays', async () => {
    const map = await createMap();
    await setMain(live.ana, map.id);

    const response = await live.http(live.ana, { method: 'DELETE', url: mapUrl(map.id) });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'MAP_IS_MAIN' });
    expect((await libraryOf(live.ana)).mainMapId).toBe(map.id);
  });

  it('a restart of the app keeps the main map', async () => {
    const map = await createMap();
    await setMain(live.ana, map.id);

    await live.restart();

    expect((await libraryOf(live.bia)).mainMapId).toBe(map.id);
  });
});

describe('a map inside a folder', () => {
  it('goes up to the parent when the folder is deleted', async () => {
    const atlas = await addFolder(live.vharn, 'Atlas');
    const reinos = await addFolder(live.vharn, 'Reinos', atlas);
    const map = await createMap({ folderId: reinos });
    const url = `/api/campaigns/${live.vharn.id}/scene-folders/${reinos}`;

    const response = await live.http(live.ana, { method: 'DELETE', url });

    expect(response.statusCode).toBe(204);
    expect((await libraryOf(live.ana)).maps.find(({ id }) => id === map.id)?.folderId).toBe(atlas);
  });

  it('a public map brings its folder to Bia; a private one does not', async () => {
    const publicFolder = await addFolder(live.vharn, 'Reveladas');
    const privateFolder = await addFolder(live.vharn, 'Segredos');
    const mundo = await createMap({ folderId: publicFolder, visibility: 'public' });
    await createMap({ folderId: privateFolder });

    const library = await libraryOf(live.bia);

    expect(library.maps.map(({ id }) => id)).toEqual([mundo.id]);
    expect(library.folders.map(({ id }) => id)).toEqual([publicFolder]);
  });
});

describe('who may do what', () => {
  it.each([
    ['POST', () => mapsUrl()],
    ['PATCH', (id: string) => mapUrl(id)],
    ['DELETE', (id: string) => mapUrl(id)],
    ['PUT', (id: string) => mainUrl(id)],
    ['DELETE', (id: string) => mainUrl(id)],
  ] as const)('Bia on %s is 403 FORBIDDEN and changes nothing', async (method, url) => {
    const map = await createMap();
    const payload =
      method === 'DELETE' || method === 'PUT' ? undefined : { name: 'Bia', assetId: map.asset.id };
    const body = method === 'PATCH' ? { name: 'Bia' } : payload;

    const response = await live.http(live.bia, { method, url: url(map.id), payload: body });

    expect(response.statusCode, response.body).toBe(403);
    expect(response.json()).toMatchObject({ code: 'FORBIDDEN' });
    expect((await libraryOf(live.ana)).maps).toMatchObject([
      { id: map.id, name: 'Mundo', isMain: false },
    ]);
  });

  it('the spectator cannot create a map either', async () => {
    const duda = await live.signUp('Duda');
    await live.joinAsSpectator(duda, live.vharn);
    const payload = { name: 'Duda', assetId: await mapAssetId() };

    const response = await live.http(duda, { method: 'POST', url: mapsUrl(), payload });

    expect(response.statusCode).toBe(403);
  });

  it('Bia, who is not at Quelm, is 404 CAMPAIGN_NOT_FOUND', async () => {
    const response = await live.http(live.bia, {
      method: 'GET',
      url: `${mapsUrl(live.quelm)}/main`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
  });

  it('without a session the routes are 401', async () => {
    const response = await live.http(null, { method: 'GET', url: `${mapsUrl()}/main` });

    expect(response.statusCode).toBe(401);
  });
});

describe('what is refused', () => {
  it('an image another map uses is 404 ASSET_NOT_FOUND', async () => {
    const map = await createMap();
    const payload = { name: 'Outro', assetId: map.asset.id };

    const response = await live.http(live.ana, { method: 'POST', url: mapsUrl(), payload });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'ASSET_NOT_FOUND' });
  });

  it('an image of another purpose is 404 ASSET_NOT_FOUND', async () => {
    const payload = { name: 'Outro', assetId: await mapAssetId(live.vharn, 'library_image') };

    const response = await live.http(live.ana, { method: 'POST', url: mapsUrl(), payload });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'ASSET_NOT_FOUND' });
  });

  it('an image or a folder of Quelm is 404 at Vharn', async () => {
    const assetOfQuelm = { name: 'Leak', assetId: await mapAssetId(live.quelm) };
    const folderId = await addFolder(live.quelm, 'Quelm');
    const folderOfQuelm = { name: 'Leak', assetId: await mapAssetId(), folderId };

    const asset = await live.http(live.ana, {
      method: 'POST',
      url: mapsUrl(),
      payload: assetOfQuelm,
    });
    const folder = await live.http(live.ana, {
      method: 'POST',
      url: mapsUrl(),
      payload: folderOfQuelm,
    });

    expect(asset.statusCode).toBe(404);
    expect(folder.statusCode).toBe(404);
    expect(folder.json()).toMatchObject({ code: 'FOLDER_NOT_FOUND' });
  });

  it.each([
    ['a userId', { userId: '3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10' }],
    ['isMain', { isMain: true }],
    ['a name of 61 characters', { name: 'x'.repeat(61) }],
  ])('%s in the body is 400 INVALID_BODY', async (_case, extra) => {
    const payload = { name: 'Mundo', assetId: await mapAssetId(), ...extra };

    const response = await live.http(live.ana, { method: 'POST', url: mapsUrl(), payload });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'INVALID_BODY' });
  });

  it('a malformed map id is 404 LIBRARY_MAP_NOT_FOUND', async () => {
    const response = await readMap(live.ana, 'not-a-uuid');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'LIBRARY_MAP_NOT_FOUND' });
  });

  it('a map of Quelm in the URL of Vharn finds nothing and stays untouched', async () => {
    const assetId = await mapAssetId(live.quelm);
    const created = await live.http(live.caio, {
      method: 'POST',
      url: mapsUrl(live.quelm),
      payload: { name: 'Quelm', assetId, visibility: 'public' },
    });
    const quelmMap = libraryMapSummaryDto.parse(created.json());

    const read = await readMap(live.ana, quelmMap.id);
    const renamed = await live.http(live.ana, {
      method: 'PATCH',
      url: mapUrl(quelmMap.id),
      payload: { name: 'Roubado' },
    });
    const removed = await live.http(live.ana, { method: 'DELETE', url: mapUrl(quelmMap.id) });

    expect([read.statusCode, renamed.statusCode, removed.statusCode]).toEqual([404, 404, 404]);
    expect((await libraryOf(live.caio, live.quelm)).maps).toMatchObject([{ name: 'Quelm' }]);
    expect((await libraryOf(live.ana)).maps).toEqual([]);
  });
});

describe('library:changed', () => {
  const heardBy = (recorder: ReturnType<typeof recordEventsOf>) =>
    recorder.events.filter(({ name }) => name === 'library:changed');

  it('reaches the table after each change, and not Quelm', async () => {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const quelm = recordEventsOf(await live.atTable(live.caio, live.quelm));

    const map = await createMap();
    await live.http(live.ana, { method: 'PATCH', url: mapUrl(map.id), payload: { name: 'Vharn' } });
    await setMain(live.ana, map.id);
    await unsetMain(live.ana, map.id);
    await live.http(live.ana, { method: 'DELETE', url: mapUrl(map.id) });

    await bia.until(5);
    await silence();
    expect(heardBy(bia)).toHaveLength(5);
    expect(heardBy(quelm)).toEqual([]);
  });

  it('marking the map that already is the main one tells nobody', async () => {
    const map = await createMap();
    await setMain(live.ana, map.id);
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));

    const response = await setMain(live.ana, map.id);

    expect(response.statusCode).toBe(200);
    await silence();
    expect(heardBy(bia)).toEqual([]);
  });

  it('a refused change tells nobody', async () => {
    const map = await createMap();
    await setMain(live.ana, map.id);
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));

    await live.http(live.ana, { method: 'DELETE', url: mapUrl(map.id) });
    await live.http(live.bia, { method: 'PATCH', url: mapUrl(map.id), payload: { name: 'Bia' } });

    await silence();
    expect(heardBy(bia)).toEqual([]);
  });
});
