import { DOCUMENT_TABS_MAX, type DocumentDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { DocumentTabsDao } from '../../src/modules/documents/document-tabs.dao';
import { DocumentHttpHarness, documentText, firstTabOf } from '../support/document-http';
import { silence } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const documents = new DocumentHttpHarness(live);
type Diary = Readonly<{ document: DocumentDto; geral: string; itens: string; segredos: string }>;
// A public "Diário" owned by Bia: "Geral", the masters-only "Segredos" and "Itens", in that order.
async function diary(): Promise<Diary> {
  const created = await documents.administer(await documents.create({ name: 'Diário' }), {
    visibility: 'public',
    ownerIds: [live.bia.id],
  });
  const withSecret = await documents.createTab(created, { name: 'Segredos' });
  const withItens = await documents.createTab(withSecret.document, { name: 'Itens' });
  const segredos = withSecret.receipt.tabId ?? '';
  const hidden = await live.http(live.ana, {
    method: 'PATCH',
    url: documents.tabUrl(created.id, segredos),
    payload: {
      actionId: crypto.randomUUID(),
      expectedVersion: withItens.document.version,
      visibility: 'masters',
    },
  });
  expect(hidden.statusCode, hidden.body).toBe(200);
  const document = await documents.read(created.id);
  return {
    document,
    geral: firstTabOf(created).id,
    itens: withItens.receipt.tabId ?? '',
    segredos,
  };
}
function structural(
  user: SignedInUser,
  method: 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload: object,
) {
  return live.http(user, { method, url, payload: { actionId: crypto.randomUUID(), ...payload } });
}

describe('document tabs over HTTP', () => {
  it('Ana creates "Itens", Bia (owner) writes in it, and the body survives a restart', async () => {
    const { document, itens } = await diary();
    const tab = await documents.readTab(document.id, itens, live.bia);
    await documents.saveTab(document.id, tab, documentText('Corda de 15 m'), live.bia);
    await live.restart();
    expect(await documents.readTab(document.id, itens, live.bia)).toMatchObject({
      name: 'Itens',
      version: 1,
      content: documentText('Corda de 15 m'),
    });
  });
  it('Bia and Ana save different tabs at the same time and neither conflicts', async () => {
    const { document, geral, itens } = await diary();
    const saved = await Promise.all([
      documents.saveTab(document.id, { id: geral, version: 0 }, documentText('Da Bia'), live.bia),
      documents.saveTab(document.id, { id: itens, version: 0 }, documentText('Da Ana')),
    ]);
    expect(saved.map(({ tab }) => tab.version)).toEqual([1, 1]);
    expect((await documents.readTab(document.id, geral)).content).toEqual(documentText('Da Bia'));
    expect((await documents.readTab(document.id, itens)).content).toEqual(documentText('Da Ana'));
  });
  it('a stale tab version is a 409 that leaves the winning body', async () => {
    const { document, itens } = await diary();
    await documents.saveTab(document.id, { id: itens, version: 0 }, documentText('Vencedor'));
    const stale = await structural(
      live.bia,
      'PATCH',
      `${documents.tabUrl(document.id, itens)}/content`,
      {
        expectedVersion: 0,
        content: documentText('Perdedor'),
      },
    );
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'DOCUMENT_VERSION_CONFLICT' });
    expect((await documents.readTab(document.id, itens)).content).toEqual(documentText('Vencedor'));
  });
  it('Bia does not see "Segredos" in the document and reading it by id is a 404', async () => {
    const { document, segredos } = await diary();
    expect((await documents.read(document.id, live.bia)).tabs.map((tab) => tab.name)).toEqual([
      'Geral',
      'Itens',
    ]);
    const secret = await live.http(live.bia, {
      method: 'GET',
      url: documents.tabUrl(document.id, segredos),
    });
    expect(secret.statusCode).toBe(404);
    expect(secret.json()).toMatchObject({ code: 'DOCUMENT_TAB_NOT_FOUND' });
    expect(secret.body).not.toContain('Segredos');
  });
  it('Bia reordering what she sees keeps "Segredos" in its slot for Ana', async () => {
    const { document, geral, itens } = await diary();
    const response = await structural(live.bia, 'PATCH', `${documents.tabUrl(document.id)}/order`, {
      expectedVersion: document.version,
      tabIds: [itens, geral],
    });
    expect(response.statusCode, response.body).toBe(200);
    expect((await documents.read(document.id)).tabs.map((tab) => tab.name)).toEqual([
      'Itens',
      'Segredos',
      'Geral',
    ]);
  });
  it('Bia changing the visibility of a visible tab is a 403', async () => {
    const { document, itens } = await diary();
    const response = await structural(live.bia, 'PATCH', documents.tabUrl(document.id, itens), {
      expectedVersion: document.version,
      visibility: 'masters',
    });
    expect(response.statusCode).toBe(403);
  });
  it.each([
    ['Caio, a player without ownership', 'caio'],
    ['a spectator', 'spectator'],
  ])(
    '%s reads the visible tabs of the public document and gets 403 creating one',
    async (_, who) => {
      const { document, itens } = await diary();
      const reader = who === 'caio' ? live.caio : await spectator();
      expect((await documents.read(document.id, reader)).tabs.map((tab) => tab.name)).toEqual([
        'Geral',
        'Itens',
      ]);
      expect((await documents.readTab(document.id, itens, reader)).name).toBe('Itens');
      const refused = await structural(reader, 'POST', documents.tabUrl(document.id), {
        expectedVersion: document.version,
      });
      expect(refused.statusCode).toBe(403);
    },
  );
  it('the Vharn ids through Quelm are DOCUMENT_NOT_FOUND, and an outsider gets CAMPAIGN_NOT_FOUND', async () => {
    const { document, itens } = await diary();
    const quelmTab = `/api/campaigns/${live.quelm.id}/documents/${document.id}/tabs/${itens}`;
    const throughQuelm = await live.http(live.caio, { method: 'GET', url: quelmTab });
    expect(throughQuelm.statusCode).toBe(404);
    expect(throughQuelm.json()).toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
    const outsider = await live.signUp('Duda');
    const direct = await live.http(outsider, {
      method: 'GET',
      url: documents.tabUrl(document.id, itens),
    });
    expect(direct.statusCode).toBe(404);
    expect(direct.json()).toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
  });
  it(`the tab beyond ${DOCUMENT_TABS_MAX} is a 422 DOCUMENT_TAB_LIMIT`, async () => {
    const document = await documents.create();
    const dao = new DocumentTabsDao(live.connection.db);
    for (let position = 1; position < DOCUMENT_TABS_MAX; position += 1)
      await dao.insert({
        campaignId: live.vharn.id,
        documentId: document.id,
        name: `Aba ${position}`,
        position,
        content: documentText(''),
      });
    const refused = await structural(live.ana, 'POST', documents.tabUrl(document.id), {
      expectedVersion: document.version,
    });
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toMatchObject({ code: 'DOCUMENT_TAB_LIMIT' });
  });
  it('deleting the only tab is a 409 DOCUMENT_TAB_LAST and deleting another works', async () => {
    const document = await documents.create();
    const only = await structural(
      live.ana,
      'DELETE',
      documents.tabUrl(document.id, firstTabOf(document).id),
      {
        expectedVersion: 0,
      },
    );
    expect(only.statusCode).toBe(409);
    expect(only.json()).toMatchObject({ code: 'DOCUMENT_TAB_LAST' });
    const { document: withTwo, receipt } = await documents.createTab(document);
    const removed = await structural(
      live.ana,
      'DELETE',
      documents.tabUrl(document.id, receipt.tabId),
      {
        expectedVersion: withTwo.version,
      },
    );
    expect(removed.statusCode, removed.body).toBe(200);
    expect((await documents.read(document.id)).tabs).toHaveLength(1);
  });
  it('library:changed goes out after each tab change and not after a refusal', async () => {
    const document = await documents.administer(await documents.create(), { visibility: 'public' });
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const { document: withTab, receipt } = await documents.createTab(document);
    await documents.saveTab(
      document.id,
      { id: receipt.tabId ?? '', version: 0 },
      documentText('x'),
    );
    await structural(live.bia, 'POST', documents.tabUrl(document.id), {
      expectedVersion: withTab.version,
    });
    await bia.until(2);
    await silence();
    expect(bia.events.filter(({ name }) => name === 'library:changed')).toHaveLength(2);
  });
});
async function spectator(): Promise<SignedInUser> {
  const duda = await live.signUp('Duda');
  await live.joinAsSpectator(duda, live.vharn);
  return duda;
}
