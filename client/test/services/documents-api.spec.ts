import { describe, expect, it } from 'vitest';
import { HttpDocumentsApi } from '@/services/documents-api';
import { HttpTransportFake } from '../support/http-transport-fake';
import {
  DOCUMENT_ACTION_ID,
  DOCUMENT_CAMPAIGN_ID,
  DOCUMENT_ID,
  ITEMS_TAB_ID,
  documentFixture,
  documentTabFixture,
  documentWrite,
  tabWrite,
  tabSummaryFixture,
} from '../support/documents-fixtures';

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
const TAB_PATH = `/campaigns/${DOCUMENT_CAMPAIGN_ID}/documents/${DOCUMENT_ID}/tabs`;
describe('document tabs over HTTP', () => {
  it('reads one validated tab body', async () => {
    const tab = documentTabFixture({ id: ITEMS_TAB_ID, name: 'Itens' });
    const transport = new HttpTransportFake().respondWith(200, { tab });
    const result = await new HttpDocumentsApi(transport).tab(
      DOCUMENT_CAMPAIGN_ID,
      DOCUMENT_ID,
      ITEMS_TAB_ID,
    );
    expect(result).toEqual({ ok: true, value: tab });
    expect(transport.requests[0]).toMatchObject({
      method: 'GET',
      path: `${TAB_PATH}/${ITEMS_TAB_ID}`,
    });
  });
  it('refuses a tab answer outside the contract', async () => {
    const tab = { ...documentTabFixture(), secret: true };
    const transport = new HttpTransportFake().respondWith(200, { tab });
    expect(
      await new HttpDocumentsApi(transport).tab(DOCUMENT_CAMPAIGN_ID, DOCUMENT_ID, ITEMS_TAB_ID),
    ).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });
  it('saves a tab body on its content route and validates the tab receipt', async () => {
    const answer = tabWrite(tabSummaryFixture({ id: ITEMS_TAB_ID, version: 1 }));
    const transport = new HttpTransportFake().respondWith(200, answer);
    const input = {
      actionId: DOCUMENT_ACTION_ID,
      expectedVersion: 0,
      content: documentTabFixture().content,
    };
    const result = await new HttpDocumentsApi(transport).saveTab(
      DOCUMENT_CAMPAIGN_ID,
      DOCUMENT_ID,
      ITEMS_TAB_ID,
      input,
    );
    expect(result).toEqual({ ok: true, value: answer });
    expect(transport.requests[0]).toMatchObject({
      method: 'PATCH',
      path: `${TAB_PATH}/${ITEMS_TAB_ID}/content`,
      body: input,
    });
  });
  it('sends the tab list commands to their routes', async () => {
    const write = documentWrite(documentFixture({ version: 1 }), 'tab-update', ITEMS_TAB_ID);
    const transport = new HttpTransportFake()
      .respondWith(200, write)
      .respondWith(200, write)
      .respondWith(200, write)
      .respondWith(200, write);
    const api = new HttpDocumentsApi(transport);
    const base = { actionId: DOCUMENT_ACTION_ID, expectedVersion: 0 };
    await api.createTab(DOCUMENT_CAMPAIGN_ID, DOCUMENT_ID, base);
    await api.updateTab(DOCUMENT_CAMPAIGN_ID, DOCUMENT_ID, ITEMS_TAB_ID, {
      ...base,
      name: 'Bolsa',
    });
    await api.reorderTabs(DOCUMENT_CAMPAIGN_ID, DOCUMENT_ID, { ...base, tabIds: [ITEMS_TAB_ID] });
    expect(await api.removeTab(DOCUMENT_CAMPAIGN_ID, DOCUMENT_ID, ITEMS_TAB_ID, base)).toEqual({
      ok: true,
      value: write,
    });
    expect(transport.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      `POST ${TAB_PATH}`,
      `PATCH ${TAB_PATH}/${ITEMS_TAB_ID}`,
      `PATCH ${TAB_PATH}/order`,
      `DELETE ${TAB_PATH}/${ITEMS_TAB_ID}`,
    ]);
  });
  it.each([
    [422, 'DOCUMENT_TAB_LIMIT', 'tab_limit'],
    [409, 'DOCUMENT_TAB_LAST', 'last_tab'],
    [404, 'DOCUMENT_TAB_NOT_FOUND', 'not_found'],
    [409, 'DOCUMENT_VERSION_CONFLICT', 'conflict'],
  ] as const)('translates a tab refusal %s %s into %s', async (status, code, kind) => {
    const transport = new HttpTransportFake().respondWith(status, { code, message: 'refused' });
    const input = { actionId: DOCUMENT_ACTION_ID, expectedVersion: 0 };
    expect(
      await new HttpDocumentsApi(transport).createTab(DOCUMENT_CAMPAIGN_ID, DOCUMENT_ID, input),
    ).toEqual({ ok: false, failure: { kind } });
  });
});
describe('document tab images over HTTP', () => {
  const asset = {
    id: '10000000-0000-4000-8000-000000000010',
    width: 80,
    height: 40,
    mimeType: 'image/png',
  };
  const imagesPath = `${TAB_PATH}/${ITEMS_TAB_ID}/images`;
  it('uploads the bytes to the tab the image goes in', async () => {
    const transport = new HttpTransportFake().respondWith(201, { asset });
    const file = new Blob(['png'], { type: 'image/png' });
    const api = new HttpDocumentsApi(transport);
    const result = await api.uploadImage(DOCUMENT_CAMPAIGN_ID, DOCUMENT_ID, ITEMS_TAB_ID, file);
    expect(result).toEqual({ ok: true, value: asset });
    expect(transport.requests[0]).toEqual({ method: 'POST', path: imagesPath, body: file });
  });
  it('imports a link and associates a library image through the tab routes', async () => {
    const transport = new HttpTransportFake()
      .respondWith(201, { asset })
      .respondWith(201, { asset });
    const api = new HttpDocumentsApi(transport);
    const url = 'https://example.test/carta.png';
    const imageId = '10000000-0000-4000-8000-000000000011';
    expect(await api.importImage(DOCUMENT_CAMPAIGN_ID, DOCUMENT_ID, ITEMS_TAB_ID, url)).toEqual({
      ok: true,
      value: asset,
    });
    await api.libraryImage(DOCUMENT_CAMPAIGN_ID, DOCUMENT_ID, ITEMS_TAB_ID, imageId);
    expect(transport.requests).toEqual([
      { method: 'POST', path: `${imagesPath}/import`, body: { url } },
      { method: 'POST', path: `${imagesPath}/from-library`, body: { imageId } },
    ]);
  });
  it('reports a tab the author may not see as not found', async () => {
    const transport = new HttpTransportFake().respondWith(404, {
      code: 'DOCUMENT_TAB_NOT_FOUND',
      message: 'refused',
    });
    const file = new Blob(['png'], { type: 'image/png' });
    expect(
      await new HttpDocumentsApi(transport).uploadImage(
        DOCUMENT_CAMPAIGN_ID,
        DOCUMENT_ID,
        ITEMS_TAB_ID,
        file,
      ),
    ).toEqual({ ok: false, failure: { kind: 'not_found' } });
  });
});
