import { describe, expect, it } from 'vitest';
import { HttpSheetTemplatesApi } from '@/services/sheet-templates-api';
import { AssetBytesReaderFake } from '../support/asset-bytes-fakes';
import { VHARN } from '../support/campaigns-api-fake';
import { HttpTransportFake } from '../support/http-transport-fake';
import { TORMENTA_TEMPLATE_ID } from '../support/sheet-fixtures';
import { tormentaTemplate } from '../support/sheet-template-fixtures';

const BASE = `/campaigns/${VHARN.id}/sheet-templates`;
const SOURCE = { files: [{ path: 'index.html', content: '<p></p>' }] };

function refusal(code: string): Readonly<{ code: string; message: string }> {
  return { code, message: `refused with ${code}` };
}

describe('sheet templates HTTP API', () => {
  it('reads one template with its code by GET …/sheet-templates/:id', async () => {
    const transport = new HttpTransportFake().respondWith(200, { template: tormentaTemplate() });
    const result = await new HttpSheetTemplatesApi(transport).detail(
      VHARN.id,
      TORMENTA_TEMPLATE_ID,
    );
    expect(result).toEqual({ ok: true, value: tormentaTemplate() });
    expect(transport.requests[0]).toMatchObject({
      method: 'GET',
      path: `${BASE}/${TORMENTA_TEMPLATE_ID}`,
    });
  });

  it('creates by POST …/sheet-templates with the body as given', async () => {
    const created = tormentaTemplate({ version: 1 });
    const transport = new HttpTransportFake().respondWith(201, { template: created });
    const input = { name: 'Ficha Tormenta', folderId: null, ...SOURCE };
    const result = await new HttpSheetTemplatesApi(transport).create(VHARN.id, input);
    expect(result).toEqual({ ok: true, value: created });
    expect(transport.requests[0]).toEqual({ method: 'POST', path: BASE, body: input });
  });

  it('saves by PATCH …/:id with the expected version and the whole code', async () => {
    const transport = new HttpTransportFake().respondWith(200, {
      template: tormentaTemplate({ version: 4 }),
    });
    const input = { expectedVersion: 3, ...SOURCE };
    await new HttpSheetTemplatesApi(transport).update(VHARN.id, TORMENTA_TEMPLATE_ID, input);
    expect(transport.requests[0]).toEqual({
      method: 'PATCH',
      path: `${BASE}/${TORMENTA_TEMPLATE_ID}`,
      body: input,
    });
  });

  it('removes by DELETE …/:id and answers null on 204', async () => {
    const transport = new HttpTransportFake().respondWith(204, null);
    const result = await new HttpSheetTemplatesApi(transport).remove(
      VHARN.id,
      TORMENTA_TEMPLATE_ID,
    );
    expect(result).toEqual({ ok: true, value: null });
    expect(transport.requests[0]?.method).toBe('DELETE');
  });

  it('a template answer over the code budget is unexpected, never trusted', async () => {
    const huge = tormentaTemplate({
      files: [{ path: 'index.html', content: 'x'.repeat(512 * 1024 + 1) }],
    });
    const transport = new HttpTransportFake().respondWith(200, { template: huge });
    const result = await new HttpSheetTemplatesApi(transport).detail(
      VHARN.id,
      TORMENTA_TEMPLATE_ID,
    );
    expect(result).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it.each([
    [409, 'SHEET_TEMPLATE_VERSION_CONFLICT', 'conflict'],
    [409, 'SHEET_TEMPLATE_IN_USE', 'in_use'],
    [404, 'FOLDER_NOT_FOUND', 'folder_not_found'],
    [404, 'SHEET_TEMPLATE_NOT_FOUND', 'not_found'],
    [403, 'FORBIDDEN', 'forbidden'],
    [400, 'VALIDATION_FAILED', 'invalid'],
    [401, 'UNAUTHENTICATED', 'unauthenticated'],
    [500, 'INTERNAL', 'unexpected'],
  ])('a %i with %s is %s', async (status, code, kind) => {
    const transport = new HttpTransportFake().respondWith(status, refusal(code));
    const result = await new HttpSheetTemplatesApi(transport).remove(
      VHARN.id,
      TORMENTA_TEMPLATE_ID,
    );
    expect(result).toEqual({ ok: false, failure: { kind } });
  });

  it('the network down is offline', async () => {
    const transport = new HttpTransportFake().failWithNetworkDown();
    const result = await new HttpSheetTemplatesApi(transport).create(VHARN.id, SOURCE);
    expect(result).toEqual({ ok: false, failure: { kind: 'offline' } });
  });
});

describe('sheet template assets over HTTP', () => {
  const FONT = { id: '00000000-0000-4000-8000-000000000001', mimeType: 'font/woff2', sizeBytes: 4 };
  const WOFF2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32]).buffer;

  it('sends the raw font by POST …/sheet-template-assets with its type', async () => {
    const transport = new HttpTransportFake().respondWith(201, { asset: FONT });

    const result = await new HttpSheetTemplatesApi(transport).uploadAsset(
      VHARN.id,
      WOFF2,
      'font/woff2',
    );

    expect(result).toEqual({ ok: true, value: FONT });
    const sent = transport.requests[0];
    expect(sent).toMatchObject({
      method: 'POST',
      path: `/campaigns/${VHARN.id}/sheet-template-assets`,
    });
    expect((sent?.body as Blob).type).toBe('font/woff2');
  });

  it.each([
    [403, 'FORBIDDEN', 'forbidden'],
    [413, 'ASSET_TOO_LARGE', 'too_large'],
    [415, 'UNSUPPORTED_IMAGE', 'unsupported_asset'],
    [422, 'UNSUPPORTED_FONT', 'unsupported_asset'],
    [429, 'RATE_LIMITED', 'rate_limited'],
  ] as const)('an upload answered %i %s is %s', async (status, code, kind) => {
    const transport = new HttpTransportFake().respondWith(status, refusal(code));
    const result = await new HttpSheetTemplatesApi(transport).uploadAsset(
      VHARN.id,
      WOFF2,
      'font/woff2',
    );
    expect(result).toEqual({ ok: false, failure: { kind } });
  });

  it('a template save refused for an asset of another table is asset_not_found', async () => {
    const transport = new HttpTransportFake().respondWith(
      404,
      refusal('SHEET_TEMPLATE_ASSET_NOT_FOUND'),
    );
    const result = await new HttpSheetTemplatesApi(transport).update(
      VHARN.id,
      TORMENTA_TEMPLATE_ID,
      {
        expectedVersion: 3,
        manifest: { permissions: [], bars: [], assets: [] },
      },
    );
    expect(result).toEqual({ ok: false, failure: { kind: 'asset_not_found' } });
  });

  it('reads the bytes of a font by GET /api/assets/:id, typed by the answer', async () => {
    const reader = new AssetBytesReaderFake();
    reader.answer = { status: 200, contentType: 'font/woff2', bytes: async () => WOFF2 };

    const result = await new HttpSheetTemplatesApi(new HttpTransportFake(), reader.read).asset(
      FONT.id,
    );

    expect(result).toEqual({ ok: true, value: { type: 'font/woff2', bytes: WOFF2 } });
    expect(reader.urls).toEqual([`/api/assets/${FONT.id}`]);
  });

  it.each([
    ['an SVG', { status: 200, contentType: 'image/svg+xml' }, 'unexpected'],
    ['a GIF', { status: 200, contentType: 'image/gif' }, 'unexpected'],
    ['a 404', { status: 404, contentType: 'application/json' }, 'not_found'],
  ])('%s read back is %s', async (_what, answer, kind) => {
    const reader = new AssetBytesReaderFake();
    reader.answer = { ...answer, bytes: async () => WOFF2 };
    const result = await new HttpSheetTemplatesApi(new HttpTransportFake(), reader.read).asset(
      FONT.id,
    );
    expect(result).toEqual({ ok: false, failure: { kind } });
  });
});
