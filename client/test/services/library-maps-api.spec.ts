import { describe, expect, it } from 'vitest';
import { HttpLibraryMapsApi } from '@/services/library-maps-api';
import { HttpTransportFake } from '../support/http-transport-fake';
import { VHARN } from '../support/campaigns-api-fake';
import {
  CAPITAL_REGION_ID,
  MUNDO_ID,
  libraryMapDetail,
  libraryMapSummary,
  mapRegion,
  pinRegion,
} from '../support/library-map-fixtures';

const MAPS = `/campaigns/${VHARN.id}/library-maps`;
const MUNDO = `${MAPS}/${MUNDO_ID}`;
const REGION = `${MUNDO}/regions/${CAPITAL_REGION_ID}`;
const ASSET_ID = 'd4f6b8ca-4567-4def-9012-445566778899';
const DOCUMENT_ID = 'e5a7c9db-5678-4ef0-8123-556677889900';
const GEOMETRY = { shape: 'pin', point: { x: 0.5, y: 0.5 } } as const;

function setup(status: number, body: unknown) {
  const http = new HttpTransportFake().respondWith(status, body);
  return { http, api: new HttpLibraryMapsApi(http) };
}

function refusal(code: string): Readonly<{ code: string; message: string }> {
  return { code, message: 'recusado' };
}

describe('HttpLibraryMapsApi', () => {
  it('reads a map with the regions its reader may know of', async () => {
    const detail = libraryMapDetail({ regions: [pinRegion({ link: { state: 'locked' } })] });
    const { http, api } = setup(200, detail);
    expect(await api.detail(VHARN.id, MUNDO_ID)).toEqual({ ok: true, value: detail });
    expect(http.requests).toEqual([{ method: 'GET', path: MUNDO, body: undefined }]);
  });

  it('a locked link with the private item in it is outside the DTO: never reaches the client', async () => {
    const region = { ...pinRegion(), link: { state: 'locked', name: 'Segredo' } };
    const { api } = setup(200, { ...libraryMapDetail(), regions: [region] });
    expect(await api.detail(VHARN.id, MUNDO_ID)).toEqual({
      ok: false,
      failure: { kind: 'unexpected' },
    });
  });

  it('reads the main map, and `null` when the table has none', async () => {
    const http = new HttpTransportFake()
      .respondWith(200, { map: libraryMapSummary({ isMain: true }) })
      .respondWith(200, { map: null });
    const api = new HttpLibraryMapsApi(http);
    const first = await api.main(VHARN.id);
    expect(first.ok && first.value?.isMain).toBe(true);
    expect(await api.main(VHARN.id)).toEqual({ ok: true, value: null });
    expect(http.requests[0]).toEqual({ method: 'GET', path: `${MAPS}/main`, body: undefined });
  });

  it('creates and updates by their routes, validating the map that comes back', async () => {
    const http = new HttpTransportFake()
      .respondWith(201, libraryMapSummary())
      .respondWith(200, libraryMapSummary({ visibility: 'private' }));
    const api = new HttpLibraryMapsApi(http);
    const input = { name: 'Mundo', assetId: ASSET_ID };
    expect((await api.create(VHARN.id, input)).ok).toBe(true);
    expect((await api.update(VHARN.id, MUNDO_ID, { visibility: 'private' })).ok).toBe(true);
    expect(http.requests).toEqual([
      { method: 'POST', path: MAPS, body: input },
      { method: 'PATCH', path: MUNDO, body: { visibility: 'private' } },
    ]);
  });

  it('deletes, marks and unmarks the main map by their routes', async () => {
    const http = new HttpTransportFake()
      .respondWith(200, libraryMapSummary({ isMain: true }))
      .respondWith(200, libraryMapSummary())
      .respondWith(204, null);
    const api = new HttpLibraryMapsApi(http);
    expect(await api.setMain(VHARN.id, MUNDO_ID)).toEqual({ ok: true, value: null });
    await api.unsetMain(VHARN.id, MUNDO_ID);
    expect(await api.remove(VHARN.id, MUNDO_ID)).toEqual({ ok: true, value: null });
    expect(http.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      `PUT ${MUNDO}/main`,
      `DELETE ${MUNDO}/main`,
      `DELETE ${MUNDO}`,
    ]);
  });

  it('writes regions by their routes, validating the region that comes back', async () => {
    const http = new HttpTransportFake()
      .respondWith(201, mapRegion())
      .respondWith(200, mapRegion({ hidden: true }))
      .respondWith(204, null);
    const api = new HttpLibraryMapsApi(http);
    const input = { name: 'Capital', geometry: GEOMETRY, color: '#aa3300' };
    expect((await api.createRegion(VHARN.id, MUNDO_ID, input)).ok).toBe(true);
    await api.updateRegion(VHARN.id, MUNDO_ID, CAPITAL_REGION_ID, { hidden: true });
    await api.removeRegion(VHARN.id, MUNDO_ID, CAPITAL_REGION_ID);
    expect(http.requests).toEqual([
      { method: 'POST', path: `${MUNDO}/regions`, body: input },
      { method: 'PATCH', path: REGION, body: { hidden: true } },
      { method: 'DELETE', path: REGION, body: undefined },
    ]);
  });

  it('shows a region to the room once, and a dropped connection is not posted again', async () => {
    const http = new HttpTransportFake().failWithNetworkDown();
    const api = new HttpLibraryMapsApi(http);
    expect(await api.showRegion(VHARN.id, MUNDO_ID, CAPITAL_REGION_ID)).toEqual({
      ok: false,
      failure: { kind: 'offline' },
    });
    expect(http.requests).toEqual([{ method: 'POST', path: `${REGION}/shows`, body: undefined }]);
  });

  it('lists where a document appears', async () => {
    const appearance = {
      mapId: MUNDO_ID,
      mapName: 'Mundo',
      regionId: CAPITAL_REGION_ID,
      regionName: 'Capital',
    };
    const { http, api } = setup(200, { appearances: [appearance] });
    expect(await api.appearances(VHARN.id, DOCUMENT_ID)).toEqual({
      ok: true,
      value: [appearance],
    });
    expect(http.requests[0]?.path).toBe(
      `/campaigns/${VHARN.id}/documents/${DOCUMENT_ID}/map-appearances`,
    );
  });

  it.each([
    [409, 'MAP_IS_MAIN', 'map_is_main'],
    [422, 'MAP_REGIONS_FULL', 'regions_full'],
    [422, 'MAP_LINK_SELF', 'link_self'],
    [404, 'MAP_LINK_TARGET_NOT_FOUND', 'link_target_not_found'],
    [409, 'MAP_REGION_NOT_SHOWABLE', 'region_not_showable'],
    [404, 'LIBRARY_MAP_NOT_FOUND', 'not_found'],
    [403, 'FORBIDDEN', 'forbidden'],
    [400, 'INVALID_INPUT', 'invalid'],
    [401, 'UNAUTHENTICATED', 'unauthenticated'],
    [500, 'BOOM', 'unexpected'],
  ])('a %i with code %s is the failure %s', async (status, code, kind) => {
    const { api } = setup(status, refusal(code));
    expect(await api.remove(VHARN.id, MUNDO_ID)).toEqual({ ok: false, failure: { kind } });
  });

  it('marking the main map with an answer outside the DTO is unexpected', async () => {
    const { api } = setup(200, { ...libraryMapSummary(), regions: [] });
    expect(await api.setMain(VHARN.id, MUNDO_ID)).toEqual({
      ok: false,
      failure: { kind: 'unexpected' },
    });
  });

  it('a list of appearances outside the DTO is unexpected', async () => {
    const { api } = setup(200, { appearances: [{ mapId: 'x' }] });
    expect(await api.appearances(VHARN.id, DOCUMENT_ID)).toEqual({
      ok: false,
      failure: { kind: 'unexpected' },
    });
  });
});
