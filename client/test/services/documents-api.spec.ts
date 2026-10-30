import { describe, expect, it } from 'vitest';
import { HttpDocumentsApi } from '@/services/documents-api';
import { HttpTransportFake } from '../support/http-transport-fake';
import { DOCUMENT_CAMPAIGN_ID, DOCUMENT_ID, documentFixture } from '../support/documents-fixtures';

describe('document HTTP API', () => {
  it('reads only a validated authorized detail', async () => {
    const transport = new HttpTransportFake().respondWith(200, { document: documentFixture() });
    const result = await new HttpDocumentsApi(transport).detail(DOCUMENT_CAMPAIGN_ID, DOCUMENT_ID);
    expect(result).toEqual({ ok: true, value: documentFixture() });
    expect(transport.requests[0]?.path).toBe(
      `/campaigns/${DOCUMENT_CAMPAIGN_ID}/documents/${DOCUMENT_ID}`,
    );
  });
  it.each([
    [409, 'DOCUMENT_VERSION_CONFLICT', 'conflict'],
    [409, 'DOCUMENT_ACTION_REUSED', 'action_reused'],
    [403, 'FORBIDDEN', 'forbidden'],
    [404, 'DOCUMENT_NOT_FOUND', 'not_found'],
  ] as const)('translates %s %s into %s', async (status, code, kind) => {
    const transport = new HttpTransportFake().respondWith(status, { code, message: 'refused' });
    expect(await new HttpDocumentsApi(transport).detail(DOCUMENT_CAMPAIGN_ID, DOCUMENT_ID)).toEqual(
      { ok: false, failure: { kind } },
    );
  });
  it('distinguishes a network outage from malformed success', async () => {
    const transport = new HttpTransportFake()
      .failWithNetworkDown()
      .respondWith(200, { document: { content: 'unsafe' } });
    const api = new HttpDocumentsApi(transport);
    expect(await api.detail(DOCUMENT_CAMPAIGN_ID, DOCUMENT_ID)).toEqual({
      ok: false,
      failure: { kind: 'offline' },
    });
    expect(await api.detail(DOCUMENT_CAMPAIGN_ID, DOCUMENT_ID)).toEqual({
      ok: false,
      failure: { kind: 'unexpected' },
    });
  });
});
