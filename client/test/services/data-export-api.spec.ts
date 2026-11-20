import { describe, expect, it } from 'vitest';
import { HttpDataExportApi } from '@/services/data-export-api';
import { FetchFake } from '../support/asset-bytes-fakes';

const ZIP_HEADERS = {
  'content-type': 'application/zip',
  'content-disposition': 'attachment; filename="lorkarium-dados-bia-2026-11-19.zip"',
};

/** A fetch that never reaches the server. */
class OfflineFetchFake {
  readonly fetch: typeof fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
}

describe('HttpDataExportApi.exportData', () => {
  it('asks the export route with the session cookie and keeps the name the server gave', async () => {
    const fake = new FetchFake(
      new Response(new Uint8Array([80, 75, 3, 4]), { headers: ZIP_HEADERS }),
    );

    const result = await new HttpDataExportApi(fake.fetch).exportData();

    expect(fake.calls).toEqual([
      { url: '/api/account/export', init: { credentials: 'same-origin' } },
    ]);
    expect(result.ok && result.value.fileName).toBe('lorkarium-dados-bia-2026-11-19.zip');
    expect(result.ok && (await result.value.blob.arrayBuffer()).byteLength).toBe(4);
  });

  it('a 429 EXPORT_TOO_SOON is too_soon with the seconds the body gives', async () => {
    const body = { code: 'EXPORT_TOO_SOON', message: 'x', retryAfterSeconds: 16200 };
    const fake = new FetchFake(
      Response.json(body, { status: 429, headers: { 'retry-after': '16200' } }),
    );

    const result = await new HttpDataExportApi(fake.fetch).exportData();

    expect(result).toEqual({ ok: false, failure: { kind: 'too_soon', retryAfterSeconds: 16200 } });
  });

  it('another refusal (a 500) is unexpected', async () => {
    const fake = new FetchFake(
      Response.json({ code: 'INTERNAL_ERROR', message: 'x' }, { status: 500 }),
    );

    const result = await new HttpDataExportApi(fake.fetch).exportData();

    expect(result).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('no network is offline', async () => {
    const result = await new HttpDataExportApi(new OfflineFetchFake().fetch).exportData();

    expect(result).toEqual({ ok: false, failure: { kind: 'offline' } });
  });
});
