import { libraryMapChangedDto, mapRegionDto, type MapRegionDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { MapRegionsOverHttp, NEW_REGION } from '../support/library-map-regions-http';
import { CITY_GEOMETRY, KINGDOM_GEOMETRY } from '../support/library-maps-factories';
import { eventPayload, silence } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const atlas = new MapRegionsOverHttp(live);

const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const STRAIGHT_LINE = {
  shape: 'polygon',
  points: [
    { x: 0.1, y: 0.1 },
    { x: 0.2, y: 0.2 },
    { x: 0.3, y: 0.3 },
  ],
};

const documentLink = (id: string) => ({ link: { kind: 'document', id } });

describe('writing a region over HTTP', () => {
  it('Ana creates a polygon: 201 with the region, no link and visible', async () => {
    const map = await atlas.createMap();

    const response = await atlas.postRegion(map.id, { ...NEW_REGION, name: '  Reino  ' });

    expect(response.statusCode, response.body).toBe(201);
    expect(mapRegionDto.parse(response.json())).toMatchObject({
      name: 'Reino',
      description: '',
      geometry: KINGDOM_GEOMETRY,
      color: '#aa3300',
      hidden: false,
      link: null,
    });
  });

  it('Ana creates a pin; the color comes back in lowercase', async () => {
    const map = await atlas.createMap();

    const region = await atlas.addRegion(map.id, { geometry: CITY_GEOMETRY, color: '#AA3300' });

    expect(region).toMatchObject({ geometry: CITY_GEOMETRY, color: '#aa3300' });
  });

  it('a pin chooses its icon, trades it, and an unknown one is 400', async () => {
    const map = await atlas.createMap();
    const region = await atlas.addRegion(map.id, { geometry: CITY_GEOMETRY, icon: 'castle' });
    expect(region.icon).toBe('castle');

    const traded = await atlas.patchRegion(map.id, region.id, { icon: 'danger' });
    expect(traded.statusCode, traded.body).toBe(200);
    expect(mapRegionDto.parse(traded.json())).toStrictEqual({ ...region, icon: 'danger' });

    const refused = await atlas.patchRegion(map.id, region.id, { icon: 'dragon' });
    expect(refused.statusCode).toBe(400);
  });

  it('a region created without an icon has the plain marker', async () => {
    const map = await atlas.createMap();
    expect((await atlas.addRegion(map.id)).icon).toBe('pin');
  });

  it('POST without a color is 400 INVALID_BODY', async () => {
    const map = await atlas.createMap();
    const { name, geometry } = NEW_REGION;

    const response = await atlas.postRegion(map.id, { name, geometry });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'INVALID_BODY' });
  });

  it('PATCH of the name alone keeps the shape and the link: 200 with the region', async () => {
    const map = await atlas.createMap();
    const diario = await atlas.documentId('Diário', 'private');
    const region = await atlas.addRegion(map.id, documentLink(diario));

    const response = await atlas.patchRegion(map.id, region.id, { name: 'Novo' });

    expect(response.statusCode, response.body).toBe(200);
    expect(mapRegionDto.parse(response.json())).toStrictEqual({
      ...region,
      name: 'Novo',
    });
  });

  it('PATCH can trade a link for one of another kind, and null takes it off', async () => {
    const map = await atlas.createMap();
    const diario = await atlas.documentId('Diário', 'private');
    const salao = await atlas.sceneId('Salão', 'private');
    const region = await atlas.addRegion(map.id, documentLink(diario));

    const traded = await atlas.patchRegion(map.id, region.id, {
      link: { kind: 'scene', id: salao },
    });
    const cleared = await atlas.patchRegion(map.id, region.id, { link: null });

    expect(traded.json<MapRegionDto>().link).toStrictEqual({
      state: 'open',
      kind: 'scene',
      id: salao,
      name: 'Salão',
    });
    expect(cleared.json<MapRegionDto>().link).toBeNull();
  });

  it('DELETE is 204 and the region leaves the map', async () => {
    const map = await atlas.createMap();
    const region = await atlas.addRegion(map.id);

    const response = await live.http(live.ana, {
      method: 'DELETE',
      url: atlas.regionUrl(map.id, region.id),
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect((await atlas.detailOf(live.ana, map.id)).regions).toEqual([]);
  });

  it('each write goes one version up', async () => {
    const map = await atlas.createMap();

    const region = await atlas.addRegion(map.id);
    await atlas.patchRegion(map.id, region.id, { name: 'Novo' });
    await live.http(live.ana, { method: 'DELETE', url: atlas.regionUrl(map.id, region.id) });

    expect((await atlas.detailOf(live.ana, map.id)).version).toBe(map.version + 3);
  });

  it('two maps can point at each other', async () => {
    const mundo = await atlas.createMap();
    const masmorra = await atlas.createMap({ name: 'Masmorra' });

    const there = await atlas.postRegion(mundo.id, {
      ...NEW_REGION,
      link: { kind: 'map', id: masmorra.id },
    });
    const back = await atlas.postRegion(masmorra.id, {
      ...NEW_REGION,
      link: { kind: 'map', id: mundo.id },
    });

    expect([there.statusCode, back.statusCode]).toEqual([201, 201]);
  });

  it('the 300th region passes and the 301st is 422 MAP_REGIONS_FULL', async () => {
    const map = await atlas.createMap();
    await atlas.fillRegions(map.id, 299);

    const last = await atlas.postRegion(map.id);
    const overflow = await atlas.postRegion(map.id);

    expect(last.statusCode, last.body).toBe(201);
    expect(overflow.statusCode).toBe(422);
    expect(overflow.json()).toMatchObject({ code: 'MAP_REGIONS_FULL' });
    expect((await atlas.detailOf(live.ana, map.id)).regions).toHaveLength(300);
  });
});

describe('what a writer is refused', () => {
  it('a link to its own map is 422 MAP_LINK_SELF', async () => {
    const map = await atlas.createMap();

    const response = await atlas.postRegion(map.id, {
      ...NEW_REGION,
      link: { kind: 'map', id: map.id },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'MAP_LINK_SELF' });
  });

  it.each(['document', 'scene', 'map', 'image'] as const)(
    'a %s that does not exist is 404 MAP_LINK_TARGET_NOT_FOUND',
    async (kind) => {
      const map = await atlas.createMap();

      const response = await atlas.postRegion(map.id, {
        ...NEW_REGION,
        link: { kind, id: MISSING_ID },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'MAP_LINK_TARGET_NOT_FOUND' });
    },
  );

  it('a target of another table is 404 MAP_LINK_TARGET_NOT_FOUND and points at nothing', async () => {
    const map = await atlas.createMap();
    const fromQuelm = await atlas.documentId('Segredo de Quelm', 'public', live.quelm);

    const response = await atlas.postRegion(map.id, { ...NEW_REGION, ...documentLink(fromQuelm) });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'MAP_LINK_TARGET_NOT_FOUND' });
    expect(response.body).not.toContain('Segredo de Quelm');
    expect((await atlas.detailOf(live.ana, map.id)).regions).toEqual([]);
  });

  it('a polygon with no area is 400, on POST and on PATCH', async () => {
    const map = await atlas.createMap();
    const region = await atlas.addRegion(map.id);

    const created = await atlas.postRegion(map.id, { ...NEW_REGION, geometry: STRAIGHT_LINE });
    const patched = await atlas.patchRegion(map.id, region.id, { geometry: STRAIGHT_LINE });

    expect([created.statusCode, patched.statusCode]).toEqual([400, 400]);
    expect(created.json()).toMatchObject({ code: 'MAP_REGION_GEOMETRY_INVALID' });
    expect((await atlas.detailOf(live.ana, map.id)).regions).toStrictEqual([region]);
  });

  it('a userId in the body is 400 INVALID_BODY', async () => {
    const map = await atlas.createMap();

    const response = await atlas.postRegion(map.id, { ...NEW_REGION, userId: live.bia.id });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'INVALID_BODY' });
  });

  it('Bia on POST, PATCH and DELETE is 403 FORBIDDEN and changes nothing', async () => {
    const map = await atlas.createMap({ visibility: 'public' });
    const region = await atlas.addRegion(map.id);
    const url = atlas.regionUrl(map.id, region.id);

    const created = await atlas.postRegion(map.id, NEW_REGION, live.bia);
    const patched = await atlas.patchRegion(map.id, region.id, { name: 'Bia' }, live.bia);
    const removed = await live.http(live.bia, { method: 'DELETE', url });

    expect([created.statusCode, patched.statusCode, removed.statusCode]).toEqual([403, 403, 403]);
    expect((await atlas.detailOf(live.ana, map.id)).regions).toStrictEqual([region]);
  });

  it('the spectator cannot write a region either', async () => {
    const map = await atlas.createMap({ visibility: 'public' });
    const duda = await live.signUp('Duda');
    await live.joinAsSpectator(duda, live.vharn);

    const response = await atlas.postRegion(map.id, NEW_REGION, duda);

    expect(response.statusCode).toBe(403);
  });

  it('without a session the routes are 401', async () => {
    const map = await atlas.createMap();

    const response = await live.http(null, {
      method: 'POST',
      url: atlas.regionsUrl(map.id),
      payload: NEW_REGION,
    });

    expect(response.statusCode).toBe(401);
  });

  it('someone who is not at the table is 404 CAMPAIGN_NOT_FOUND', async () => {
    const map = await atlas.createMap({}, live.quelm);

    const response = await live.http(live.bia, {
      method: 'POST',
      url: atlas.regionsUrl(map.id, live.quelm),
      payload: NEW_REGION,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
  });
});

describe('addresses', () => {
  it('a map of Quelm under the URL of Vharn is 404 LIBRARY_MAP_NOT_FOUND', async () => {
    const quelmMap = await atlas.createMap({}, live.quelm);

    const response = await atlas.postRegion(quelmMap.id);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'LIBRARY_MAP_NOT_FOUND' });
  });

  it('a region of Quelm under the URL of Vharn is 404 and stays as it was', async () => {
    const quelmMap = await atlas.createMap({}, live.quelm);
    const created = await live.http(live.caio, {
      method: 'POST',
      url: atlas.regionsUrl(quelmMap.id, live.quelm),
      payload: NEW_REGION,
    });
    const region = mapRegionDto.parse(created.json());
    const vharnMap = await atlas.createMap();

    const renamed = await atlas.patchRegion(vharnMap.id, region.id, { name: 'Roubado' });
    const removed = await live.http(live.ana, {
      method: 'DELETE',
      url: atlas.regionUrl(quelmMap.id, region.id),
    });

    expect([renamed.statusCode, removed.statusCode]).toEqual([404, 404]);
    expect(renamed.json()).toMatchObject({ code: 'MAP_REGION_NOT_FOUND' });
    const read = await live.http(live.caio, {
      method: 'GET',
      url: `${atlas.mapsUrl(live.quelm)}/${quelmMap.id}`,
    });
    expect(read.json()).toMatchObject({ regions: [{ id: region.id, name: 'Reino' }] });
  });

  it('a region of another map of the same table is 404 MAP_REGION_NOT_FOUND', async () => {
    const mundo = await atlas.createMap();
    const masmorra = await atlas.createMap({ name: 'Masmorra' });
    const region = await atlas.addRegion(mundo.id);

    const response = await atlas.patchRegion(masmorra.id, region.id, { name: 'Novo' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'MAP_REGION_NOT_FOUND' });
  });

  it('a malformed region id is 404 MAP_REGION_NOT_FOUND', async () => {
    const map = await atlas.createMap();

    const response = await atlas.patchRegion(map.id, 'not-a-uuid', { name: 'Novo' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'MAP_REGION_NOT_FOUND' });
  });
});

describe('library:mapChanged', () => {
  const heard = (recorder: ReturnType<typeof recordEventsOf>) =>
    recorder.events.filter(({ name }) => name === 'library:mapChanged');

  it('reaches the table with the map and the version, without name or geometry', async () => {
    const map = await atlas.createMap({ visibility: 'public' });
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));

    await atlas.addRegion(map.id, { name: 'Cofre Secreto', hidden: true });

    const payload = await eventPayload(bia, 'library:mapChanged');
    expect(libraryMapChangedDto.parse(payload)).toMatchObject({
      campaignId: live.vharn.id,
      mapId: map.id,
      version: map.version + 1,
    });
    const text = JSON.stringify(payload);
    expect(text).not.toContain('Cofre Secreto');
    expect(text).not.toContain('points');
  });

  it('every write announces once, and Quelm hears none of it', async () => {
    const map = await atlas.createMap({ visibility: 'public' });
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const quelm = recordEventsOf(await live.atTable(live.caio, live.quelm));

    const region = await atlas.addRegion(map.id);
    await atlas.patchRegion(map.id, region.id, { name: 'Novo' });
    await live.http(live.ana, { method: 'DELETE', url: atlas.regionUrl(map.id, region.id) });

    await bia.until(3);
    await silence();
    expect(heard(bia)).toHaveLength(3);
    expect(heard(quelm)).toEqual([]);
  });

  it('a refused write tells nobody', async () => {
    const map = await atlas.createMap({ visibility: 'public' });
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));

    await atlas.postRegion(map.id, NEW_REGION, live.bia);
    await atlas.postRegion(map.id, { ...NEW_REGION, geometry: STRAIGHT_LINE });

    await silence();
    expect(heard(bia)).toEqual([]);
  });
});
