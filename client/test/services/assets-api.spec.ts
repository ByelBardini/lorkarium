import { beforeEach, describe, expect, it } from 'vitest';
import { HttpAssetsApi, assetUrlOf } from '@/services/assets-api';
import { VHARN } from '../support/campaigns-api-fake';
import { HttpTransportFake } from '../support/http-transport-fake';

const ASSET = {
  id: '4a3b2c1d-0e9f-4a8b-9c7d-6e5f4a3b2c1d',
  mimeType: 'image/png',
  width: 400,
  height: 400,
} as const;

function pngFile(): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'lyra.png', { type: 'image/png' });
}

describe('HttpAssetsApi', () => {
  let transport: HttpTransportFake;
  let api: HttpAssetsApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpAssetsApi(transport);
  });

  it('upload posts the file itself to the table with the purpose and answers the asset', async () => {
    transport.respondWith(201, { asset: ASSET });
    const file = pngFile();

    const result = await api.upload(VHARN.id, file, 'token');

    expect(result).toEqual({ ok: true, asset: ASSET });
    expect(transport.requests).toEqual([
      { method: 'POST', path: `/campaigns/${VHARN.id}/assets?purpose=token`, body: file },
    ]);
  });

  it('importLink posts the link and the purpose as JSON', async () => {
    transport.respondWith(201, { asset: ASSET });

    await api.importLink(VHARN.id, 'https://x.com/mapa.png', 'background');

    expect(transport.requests).toEqual([
      {
        method: 'POST',
        path: `/campaigns/${VHARN.id}/assets/import`,
        body: { url: 'https://x.com/mapa.png', purpose: 'background' },
      },
    ]);
  });

  it.each([
    [413, 'ASSET_TOO_LARGE', 'too_large'],
    [415, 'UNSUPPORTED_IMAGE', 'unsupported'],
    [422, 'UNSUPPORTED_IMAGE', 'unsupported'],
    [422, 'LINK_BLOCKED', 'link_blocked'],
    [422, 'LINK_NOT_IMAGE', 'link_not_image'],
    [422, 'LINK_UNREACHABLE', 'link_unreachable'],
    [404, 'CAMPAIGN_NOT_FOUND', 'not_found'],
    [401, 'UNAUTHENTICATED', 'unauthenticated'],
    [400, 'INVALID_BODY', 'invalid'],
    [500, 'INTERNAL_ERROR', 'unexpected'],
  ])('a %s %s is the %s failure', async (status, code, kind) => {
    transport.respondWith(status, { code, message: 'x' });

    expect(await api.upload(VHARN.id, pngFile(), 'token')).toEqual({
      ok: false,
      failure: { kind },
    });
  });

  it('a 429 is rate_limited with the seconds to wait', async () => {
    transport.respondWith(429, { code: 'RATE_LIMITED', message: 'x', retryAfterSeconds: 12 });

    expect(await api.importLink(VHARN.id, 'https://x.com/a.png', 'token')).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 12 },
    });
  });

  it('a 201 body outside the DTO is unexpected', async () => {
    transport.respondWith(201, { asset: { id: 'x' } });

    expect(await api.upload(VHARN.id, pngFile(), 'token')).toEqual({
      ok: false,
      failure: { kind: 'unexpected' },
    });
  });

  it('a network down is offline', async () => {
    transport.failWithNetworkDown();

    expect(await api.upload(VHARN.id, pngFile(), 'token')).toEqual({
      ok: false,
      failure: { kind: 'offline' },
    });
  });
});

describe('assetUrlOf', () => {
  it('an asset is read from the same origin under /api/assets', () => {
    expect(assetUrlOf(ASSET.id)).toBe(`/api/assets/${ASSET.id}`);
  });
});
