import { describe, expect, it } from 'vitest';
import { HttpSheetsApi, fetchAssetBytes } from '@/services/sheets-api';
import { AssetBytesReaderFake, FetchFake } from '../support/asset-bytes-fakes';
import { VHARN } from '../support/campaigns-api-fake';
import { LYRA_ANCHOR_ID } from '../support/cast-fixtures';
import { LYRA_CHARACTER_ID } from '../support/character-fixtures';
import { HttpTransportFake } from '../support/http-transport-fake';
import {
  LYRA_SHEET_ID,
  SHEET_ACTION_ID,
  TORMENTA_TEMPLATE_ID,
  lyraSheet,
  lyraSummary,
  sheetResponse,
  sheetValuesWrite,
} from '../support/sheet-fixtures';

const ASSET_ID = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
const SHEET_PATH = `/campaigns/${VHARN.id}/sheets/${LYRA_SHEET_ID}`;

function apiOver(transport: HttpTransportFake, reader = new AssetBytesReaderFake()): HttpSheetsApi {
  return new HttpSheetsApi(transport, reader.read);
}

describe('sheets HTTP API', () => {
  it('reads a sheet with its template by the sheet route', async () => {
    const transport = new HttpTransportFake().respondWith(200, sheetResponse());
    const result = await apiOver(transport).detail(VHARN.id, LYRA_SHEET_ID);
    expect(result).toEqual({ ok: true, value: sheetResponse() });
    expect(transport.requests[0]).toMatchObject({ method: 'GET', path: SHEET_PATH });
  });

  it('reads the sheets of a token by the token route, as their summaries', async () => {
    const transport = new HttpTransportFake().respondWith(200, { sheets: [lyraSummary()] });
    const result = await apiOver(transport).ofToken(VHARN.id, LYRA_ANCHOR_ID);
    expect({ result, path: transport.requests[0]?.path }).toEqual({
      result: { ok: true, value: [lyraSummary()] },
      path: `/campaigns/${VHARN.id}/tokens/${LYRA_ANCHOR_ID}/sheets`,
    });
  });

  it('reads the sheets of a character by the character route, the same shape as a token', async () => {
    const transport = new HttpTransportFake().respondWith(200, { sheets: [lyraSummary()] });
    const result = await apiOver(transport).ofCharacter(VHARN.id, LYRA_CHARACTER_ID);
    expect({ result, request: transport.requests[0] }).toMatchObject({
      result: { ok: true, value: [lyraSummary()] },
      request: {
        method: 'GET',
        path: `/campaigns/${VHARN.id}/characters/${LYRA_CHARACTER_ID}/sheets`,
      },
    });
  });

  it('a token list with the values of a sheet is outside the DTO: unexpected', async () => {
    const leaked = { sheets: [{ ...lyraSummary(), values: { forca: 14 } }] };
    const transport = new HttpTransportFake().respondWith(200, leaked);
    const result = await apiOver(transport).ofToken(VHARN.id, LYRA_ANCHOR_ID);
    expect(result).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('a sheet answer outside the DTO (values with a forbidden key) is unexpected', async () => {
    const bad = {
      ...sheetResponse(),
      sheet: { ...lyraSheet(), values: JSON.parse('{"__proto__":1}') },
    };
    const transport = new HttpTransportFake().respondWith(200, bad);
    const result = await apiOver(transport).detail(VHARN.id, LYRA_SHEET_ID);
    expect(result).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('a values patch goes by PATCH …/values and answers the validated write', async () => {
    const write = sheetValuesWrite(lyraSheet({ version: 2, values: { forca: 16 } }));
    const transport = new HttpTransportFake().respondWith(200, write);
    const input = { actionId: SHEET_ACTION_ID, changes: { forca: 16 } };
    const result = await apiOver(transport).saveValues(VHARN.id, LYRA_SHEET_ID, input);
    expect(result).toEqual({ ok: true, value: write });
    expect(transport.requests[0]).toEqual({
      method: 'PATCH',
      path: `${SHEET_PATH}/values`,
      body: input,
    });
  });

  it('create, update and remove use the sheet routes', async () => {
    const write = sheetValuesWrite(lyraSheet());
    const transport = new HttpTransportFake()
      .respondWith(201, write)
      .respondWith(200, write)
      .respondWith(204, null);
    const api = apiOver(transport);
    const create = {
      actionId: SHEET_ACTION_ID,
      templateId: TORMENTA_TEMPLATE_ID,
      name: 'Lyra de Vharn',
      holder: { memberId: lyraSheet().memberId ?? '' },
    };
    await api.create(VHARN.id, create);
    const update = { actionId: SHEET_ACTION_ID, name: 'Lyra', holder: null };
    await api.update(VHARN.id, LYRA_SHEET_ID, update);
    const removed = await api.remove(VHARN.id, LYRA_SHEET_ID, { actionId: SHEET_ACTION_ID });
    const sent = transport.requests.map(({ method, path, body }) => ({ method, path, body }));
    expect({ sent, removed }).toEqual({
      sent: [
        { method: 'POST', path: `/campaigns/${VHARN.id}/sheets`, body: create },
        { method: 'PATCH', path: SHEET_PATH, body: update },
        { method: 'DELETE', path: SHEET_PATH, body: { actionId: SHEET_ACTION_ID } },
      ],
      removed: { ok: true, value: null },
    });
  });

  it.each([
    [409, 'SHEET_ACTION_REUSED', 'action_reused'],
    [404, 'MEMBER_NOT_FOUND', 'member_not_found'],
    [404, 'FOLDER_NOT_FOUND', 'not_found'],
    [400, 'INVALID_BODY', 'invalid'],
    [401, 'UNAUTHENTICATED', 'unauthenticated'],
    [403, 'FORBIDDEN', 'forbidden'],
    [404, 'SHEET_NOT_FOUND', 'not_found'],
    [500, 'INTERNAL', 'unexpected'],
  ] as const)('a %s %s refusal is %s', async (status, code, kind) => {
    const transport = new HttpTransportFake().respondWith(status, { code, message: 'refused' });
    const result = await apiOver(transport).detail(VHARN.id, LYRA_SHEET_ID);
    expect(result).toEqual({ ok: false, failure: { kind } });
  });

  it('a network outage is offline', async () => {
    const transport = new HttpTransportFake().failWithNetworkDown();
    const result = await apiOver(transport).saveValues(VHARN.id, LYRA_SHEET_ID, {
      actionId: SHEET_ACTION_ID,
      changes: { forca: 16 },
    });
    expect(result).toEqual({ ok: false, failure: { kind: 'offline' } });
  });
});

describe('sheets HTTP API: the token image as bytes', () => {
  const bytes = new Uint8Array([137, 80, 78, 71]).buffer;

  it('reads the asset route and answers the bytes with their image type', async () => {
    const reader = new AssetBytesReaderFake();
    reader.answer = {
      status: 200,
      contentType: 'image/png; charset=binary',
      bytes: async () => bytes,
    };
    const result = await apiOver(new HttpTransportFake(), reader).image(ASSET_ID);
    expect({ result, urls: reader.urls }).toEqual({
      result: { ok: true, value: { type: 'image/png', bytes } },
      urls: [`/api/assets/${ASSET_ID}`],
    });
  });

  it.each([
    ['an SVG', { status: 200, contentType: 'image/svg+xml' }, 'unexpected'],
    ['no content type', { status: 200, contentType: null }, 'unexpected'],
    ['a 404', { status: 404, contentType: 'application/json' }, 'not_found'],
  ])('%s is refused as %s', async (_, answer, kind) => {
    const reader = new AssetBytesReaderFake();
    reader.answer = { ...answer, bytes: async () => bytes };
    const result = await apiOver(new HttpTransportFake(), reader).image(ASSET_ID);
    expect(result).toEqual({ ok: false, failure: { kind } });
  });

  it('a reader that throws is offline', async () => {
    const reader = new AssetBytesReaderFake();
    reader.answer = 'offline';
    const result = await apiOver(new HttpTransportFake(), reader).image(ASSET_ID);
    expect(result).toEqual({ ok: false, failure: { kind: 'offline' } });
  });

  it('fetchAssetBytes reads with the session cookie and hands the status, type and bytes', async () => {
    const fake = new FetchFake(new Response(bytes, { headers: { 'content-type': 'image/webp' } }));
    const answer = await fetchAssetBytes(fake.fetch)('/api/assets/x');
    const read = {
      status: answer.status,
      type: answer.contentType,
      size: (await answer.bytes()).byteLength,
    };
    expect({ read, calls: fake.calls }).toEqual({
      read: { status: 200, type: 'image/webp', size: 4 },
      calls: [{ url: '/api/assets/x', init: { credentials: 'same-origin' } }],
    });
  });
});
