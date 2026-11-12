import {
  libraryMapRegionShownDto,
  mapAppearancesResponseDto,
  type MapRegionDto,
} from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { MapRegionsOverHttp } from '../support/library-map-regions-http';
import { eventPayload, silence } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { setAccountPlan } from '../support/account-plans';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
// Vharn as it was before the plans: its owner has no plan limit.
beforeEach(() => setAccountPlan(live.connection.db, live.ana.id, 'amigo_do_dono'));
const atlas = new MapRegionsOverHttp(live);

const SHOWN = 'library:mapRegionShown';

function show(mapId: string, regionId: string, user: SignedInUser = live.ana) {
  return live.http(user, { method: 'POST', url: `${atlas.regionUrl(mapId, regionId)}/shows` });
}

function appearancesOf(user: SignedInUser, documentId: string, table: Table = live.vharn) {
  const url = `/api/campaigns/${table.id}/documents/${documentId}/map-appearances`;
  return live.http(user, { method: 'GET', url });
}

const heard = (recorder: ReturnType<typeof recordEventsOf>) =>
  recorder.events.filter(({ name }) => name === SHOWN);

async function publicRegion(
  overrides: object = {},
): Promise<{ mapId: string; region: MapRegionDto }> {
  const map = await atlas.createMap({ visibility: 'public' });
  return { mapId: map.id, region: await atlas.addRegion(map.id, overrides) };
}

describe('showing a region to the table', () => {
  it('Ana shows it: 204, and Bia and the spectator get the event', async () => {
    const { mapId, region } = await publicRegion();
    const duda = await live.signUp('Duda');
    await live.joinAsSpectator(duda, live.vharn);
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const spectator = recordEventsOf(await live.atTable(duda, live.vharn));

    const response = await show(mapId, region.id);

    expect(response.statusCode, response.body).toBe(204);
    expect(response.body).toBe('');
    for (const recorder of [bia, spectator]) {
      expect(libraryMapRegionShownDto.parse(await eventPayload(recorder, SHOWN))).toMatchObject({
        campaignId: live.vharn.id,
        mapId,
        regionId: region.id,
      });
    }
  });

  it('saves nothing: the version stays and no library:mapChanged goes out', async () => {
    const { mapId, region } = await publicRegion();
    const before = (await atlas.detailOf(live.ana, mapId)).version;
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));

    await show(mapId, region.id);

    await eventPayload(bia, SHOWN);
    await silence();
    expect((await atlas.detailOf(live.ana, mapId)).version).toBe(before);
    expect(bia.events.map(({ name }) => name)).not.toContain('library:mapChanged');
  });

  it('a private map that is the main one can be shown', async () => {
    const map = await atlas.createMap();
    await live.http(live.ana, { method: 'PUT', url: `${atlas.mapsUrl()}/${map.id}/main` });
    const region = await atlas.addRegion(map.id);

    const response = await show(map.id, region.id);

    expect(response.statusCode, response.body).toBe(204);
  });

  it('a hidden region is 409 MAP_REGION_NOT_SHOWABLE, with no event', async () => {
    const { mapId, region } = await publicRegion({ hidden: true });
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));

    const response = await show(mapId, region.id);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'MAP_REGION_NOT_SHOWABLE' });
    await silence();
    expect(heard(bia)).toEqual([]);
  });

  it('a private map that is not the main one is 409, with no event', async () => {
    const map = await atlas.createMap();
    const region = await atlas.addRegion(map.id);
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));

    const response = await show(map.id, region.id);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'MAP_REGION_NOT_SHOWABLE' });
    await silence();
    expect(heard(bia)).toEqual([]);
  });

  it('Bia showing is 403 FORBIDDEN, with no event', async () => {
    const { mapId, region } = await publicRegion();
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));

    const response = await show(mapId, region.id, live.bia);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'FORBIDDEN' });
    await silence();
    expect(heard(bia)).toEqual([]);
  });

  it('Quelm does not hear a region shown at Vharn', async () => {
    const { mapId, region } = await publicRegion();
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const quelm = recordEventsOf(await live.atTable(live.caio, live.quelm));

    await show(mapId, region.id);

    await eventPayload(bia, SHOWN);
    await silence();
    expect(heard(quelm)).toEqual([]);
  });

  it('a region at another address is 404 MAP_REGION_NOT_FOUND', async () => {
    const { region } = await publicRegion();
    const other = await atlas.createMap({ name: 'Masmorra', visibility: 'public' });

    const response = await show(other.id, region.id);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'MAP_REGION_NOT_FOUND' });
  });

  it('a map of Quelm under the URL of Vharn is 404 LIBRARY_MAP_NOT_FOUND', async () => {
    const quelmMap = await atlas.createMap({ visibility: 'public' }, live.quelm);
    const { region } = await publicRegion();

    const response = await show(quelmMap.id, region.id);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'LIBRARY_MAP_NOT_FOUND' });
  });
});

describe('"Aparece em"', () => {
  it('answers 200 with the map and the region, and is never cached', async () => {
    const diario = await atlas.documentId('Diário', 'public');
    const map = await atlas.createMap({ visibility: 'public' });
    const region = await atlas.addRegion(map.id, { link: { kind: 'document', id: diario } });

    const response = await appearancesOf(live.bia, diario);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(mapAppearancesResponseDto.parse(response.json())).toStrictEqual({
      appearances: [
        {
          mapId: map.id,
          mapName: 'Mundo',
          regionId: region.id,
          regionName: 'Reino',
          tabName: null,
        },
      ],
    });
  });

  it('Ana sees a hidden region and a private map; Bia sees neither', async () => {
    const diario = await atlas.documentId('Diário', 'public');
    const link = { link: { kind: 'document', id: diario } };
    const open = await atlas.createMap({ visibility: 'public', name: 'Aberto' });
    const closed = await atlas.createMap({ name: 'Fechado' });
    await atlas.addRegion(open.id, { ...link, hidden: true, name: 'Cofre' });
    await atlas.addRegion(closed.id, { ...link, name: 'Torre' });

    const master = await appearancesOf(live.ana, diario);
    const player = await appearancesOf(live.bia, diario);

    expect(
      mapAppearancesResponseDto
        .parse(master.json())
        .appearances.map(({ regionName }) => regionName),
    ).toEqual(['Cofre', 'Torre']);
    expect(player.json()).toEqual({ appearances: [] });
    expect(player.body).not.toContain('Cofre');
    expect(player.body).not.toContain('Fechado');
  });

  it('a document Bia does not read is 404 DOCUMENT_NOT_FOUND, never 403', async () => {
    const diario = await atlas.documentId('Diário', 'private');
    const map = await atlas.createMap({ visibility: 'public' });
    await atlas.addRegion(map.id, { link: { kind: 'document', id: diario } });

    const response = await appearancesOf(live.bia, diario);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
    expect(response.body).not.toContain('Mundo');
  });

  it('Bia reads the places of a private document she owns', async () => {
    const diario = await atlas.documentId('Diário', 'private');
    await atlas.makeOwner(diario, live.bia);
    const map = await atlas.createMap({ visibility: 'public' });
    await atlas.addRegion(map.id, { link: { kind: 'document', id: diario } });

    const response = await appearancesOf(live.bia, diario);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ appearances: [{ mapId: map.id }] });
  });

  it('a document of Quelm under the URL of Vharn is 404 DOCUMENT_NOT_FOUND', async () => {
    const fromQuelm = await atlas.documentId('Quelm', 'public', live.quelm);

    const response = await appearancesOf(live.ana, fromQuelm);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
  });

  it('Bia, who is not at Quelm, is 404 CAMPAIGN_NOT_FOUND', async () => {
    const fromQuelm = await atlas.documentId('Quelm', 'public', live.quelm);

    const response = await appearancesOf(live.bia, fromQuelm, live.quelm);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
  });

  it('a malformed document id is 404 DOCUMENT_NOT_FOUND', async () => {
    const response = await appearancesOf(live.ana, 'not-a-uuid');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
  });
});
