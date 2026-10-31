import { describe, expect, it, vi } from 'vitest';
import { createDocumentEditorStore, documentTabEditorKey } from '@/stores/document-editor-store';
import { DocumentsApiFake } from '../support/documents-api-fake';
import { InteractionClockFake } from '../support/interaction-clock-fake';
import {
  DOCUMENT_ACTION_ID,
  DOCUMENT_CAMPAIGN_ID,
  DOCUMENT_ID,
  GENERAL_TAB_ID,
  ITEMS_TAB_ID,
  SECRETS_TAB_ID,
  documentFixture,
  documentTabFixture,
  documentText,
  documentWrite,
  tabSummaryFixture,
  threeTabs,
} from '../support/documents-fixtures';

async function setup(api = new DocumentsApiFake()) {
  const clock = new InteractionClockFake();
  const store = createDocumentEditorStore({
    api,
    clock,
    campaignId: DOCUMENT_CAMPAIGN_ID,
    documentId: DOCUMENT_ID,
    newActionId: () => DOCUMENT_ACTION_ID,
  });
  await store.getState().load();
  return { api, clock, store };
}
describe('document autosave', () => {
  it('coalesces invalidations into serial reads and reauthorizes before resuming writes', async () => {
    const { api, store, clock } = await setup();
    let answer: ((result: Awaited<ReturnType<typeof api.detail>>) => void) | undefined;
    api.heldDetail = new Promise((resolve) => {
      answer = resolve;
    });
    store.getState().setLive(false);
    store.getState().edit({ name: 'Pendente' });
    store.getState().setLive(true);
    const pending = store.getState().revalidate();
    void store.getState().revalidate();
    clock.advance(2000);
    expect(api.saves).toEqual([]);
    expect(api.detailCalls).toBe(2);
    api.heldDetail = null;
    api.document = documentFixture({ canEdit: false });
    answer?.({ ok: true, value: documentFixture() });
    await pending;
    expect(api.detailCalls).toBe(3);
    expect(store.getState().status).toBe('forbidden');
    expect(store.getState().draft?.name).toBe('Pendente');
  });
  it('reconciles a timed-out commit before saving a newer draft', async () => {
    const { api, store } = await setup();
    api.saveResult = { ok: false, failure: { kind: 'offline' } };
    store.getState().edit({ name: 'A enviada' });
    await store.getState().flush();
    store.getState().edit({ name: 'B pendente' });
    api.document = documentFixture({ name: 'A enviada', version: 1 });
    api.saveResult = null;
    await store.getState().revalidate();
    await store.getState().flush();
    expect(api.saves[1]?.name).toBe('B pendente');
    expect(api.saves[1]?.expectedVersion).toBe(1);
    expect(store.getState().draft?.name).toBe('B pendente');
  });
  it('keeps conflict paused through repeated library invalidations', async () => {
    const { api, store } = await setup();
    store.getState().edit({ name: 'Meu texto' });
    api.document = documentFixture({ name: 'Texto remoto', version: 1 });
    await store.getState().revalidate();
    await store.getState().revalidate();
    await store.getState().flush();
    expect(store.getState().status).toBe('conflict');
    expect(store.getState().draft?.name).toBe('Meu texto');
    expect(api.saves).toEqual([]);
  });
  it('waits one second after typing before sending one versioned command', async () => {
    const { api, clock, store } = await setup();
    store.getState().edit({ name: 'B' });
    clock.advance(999);
    expect(api.saves).toEqual([]);
    clock.advance(1);
    await Promise.resolve();
    expect(api.saves).toEqual([{ name: 'B', actionId: DOCUMENT_ACTION_ID, expectedVersion: 0 }]);
  });
  it('preserves B typed while A is saving and sends it against the acknowledged version', async () => {
    const { api, store } = await setup();
    api.holdSave = true;
    store.getState().edit({ name: 'A enviada' });
    const saving = store.getState().flush();
    store.getState().edit({ name: 'B pendente' });
    api.heldSave?.({
      ok: true,
      value: documentWrite(documentFixture({ name: 'A enviada', version: 1 })),
    });
    await saving;
    expect(store.getState().draft?.name).toBe('B pendente');
    expect(store.getState().dirty).toBe(true);
    api.holdSave = false;
    await store.getState().flush();
    expect(api.saves[1]?.expectedVersion).toBe(1);
    expect(store.getState().dirty).toBe(false);
  });
  it('pauses after conflict and keeps the local draft', async () => {
    const { api, clock, store } = await setup();
    api.saveResult = { ok: false, failure: { kind: 'conflict' } };
    store.getState().edit({ name: 'Meu texto' });
    await store.getState().flush();
    clock.advance(10000);
    expect(store.getState().status).toBe('conflict');
    expect(store.getState().draft?.name).toBe('Meu texto');
    expect(api.saves).toHaveLength(1);
  });
  it('clears confirmed content and draft after access returns 404', async () => {
    const { api, store } = await setup();
    store.getState().edit({ name: 'segredo' });
    api.detailResult = { ok: false, failure: { kind: 'not_found' } };
    await store.getState().revalidate();
    expect(store.getState().draft).toBeNull();
    expect(store.getState().confirmed).toBeNull();
    expect(store.getState().status).toBe('not_found');
  });
  it('keeps a copyable draft when editing is revoked but reading remains', async () => {
    const { api, store } = await setup();
    store.getState().edit({ name: 'rascunho' });
    api.document = documentFixture({ canEdit: false, canManage: false, visibility: 'public' });
    await store.getState().revalidate();
    expect(store.getState().status).toBe('forbidden');
    expect(store.getState().draft?.name).toBe('rascunho');
    await store.getState().flush();
    expect(api.saves).toEqual([]);
  });
  it('ignores a save response after disposal', async () => {
    const { api, store } = await setup();
    api.holdSave = true;
    store.getState().edit({ name: 'B' });
    const saving = store.getState().flush();
    store.getState().dispose();
    api.heldSave?.({ ok: true, value: documentWrite(documentFixture({ name: 'B', version: 1 })) });
    await saving;
    expect(store.getState().draft).toBeNull();
    expect(store.getState().confirmed).toBeNull();
  });
});

async function withThreeTabs() {
  const api = new DocumentsApiFake();
  api.document = documentFixture({ tabs: threeTabs() });
  const opened = await setup(api);
  const open = async (tabId: string) => {
    const tab = opened.store.getState().openTab(tabId)!;
    await tab.getState().load();
    return tab;
  };
  return { ...opened, open };
}
const keyOf = (tabId: string): string =>
  documentTabEditorKey(DOCUMENT_CAMPAIGN_ID, DOCUMENT_ID, tabId);
describe('one draft per document tab', () => {
  it('switching from "Itens" to "Geral" saves "Itens" at once and keeps the drafts apart', async () => {
    const { api, store, open } = await withThreeTabs();
    const items = await open(ITEMS_TAB_ID);
    items.getState().edit({ content: documentText('Espada') });
    const general = await open(GENERAL_TAB_ID);
    await Promise.resolve();
    expect(api.tabSaves).toEqual([
      {
        tabId: ITEMS_TAB_ID,
        actionId: DOCUMENT_ACTION_ID,
        expectedVersion: 0,
        content: documentText('Espada'),
      },
    ]);
    expect(general.getState().draft?.content).toEqual(documentText('A'));
    expect(store.getState().tabEditors[keyOf(ITEMS_TAB_ID)]).toBe(items);
  });
  it('the answer for "Itens" does not clear what was typed in "Geral" meanwhile', async () => {
    const { api, store, open } = await withThreeTabs();
    const items = await open(ITEMS_TAB_ID);
    const general = await open(GENERAL_TAB_ID);
    api.holdTabSaves = true;
    items.getState().edit({ content: documentText('Espada') });
    const saving = items.getState().flush();
    general.getState().edit({ content: documentText('Mapa') });
    api.heldTabSaves[ITEMS_TAB_ID]?.({
      ok: true,
      value: {
        tab: tabSummaryFixture({ id: ITEMS_TAB_ID, name: 'Itens', version: 1 }),
        receipt: {
          actionId: DOCUMENT_ACTION_ID,
          documentId: DOCUMENT_ID,
          tabId: ITEMS_TAB_ID,
          version: 1,
          operation: 'tab-content',
        },
      },
    });
    await saving;
    expect(items.getState()).toMatchObject({ dirty: false, status: 'saved' });
    expect(general.getState().draft?.content).toEqual(documentText('Mapa'));
    expect(general.getState().dirty).toBe(true);
    expect(store.getState().dirty).toBe(true);
  });
  it('a conflict in one tab does not pause another', async () => {
    const { api, open } = await withThreeTabs();
    const items = await open(ITEMS_TAB_ID);
    const general = await open(GENERAL_TAB_ID);
    api.tabSaveResults[ITEMS_TAB_ID] = { ok: false, failure: { kind: 'conflict' } };
    items.getState().edit({ content: documentText('Espada') });
    general.getState().edit({ content: documentText('Mapa') });
    await Promise.all([items.getState().flush(), general.getState().flush()]);
    expect(items.getState().status).toBe('conflict');
    expect(general.getState()).toMatchObject({ status: 'saved', dirty: false });
    expect(api.tabBodies[GENERAL_TAB_ID]?.content).toEqual(documentText('Mapa'));
  });
  it('a tab hidden by the master drops its draft on the next read and keeps the others', async () => {
    const { api, store, open } = await withThreeTabs();
    const secrets = await open(SECRETS_TAB_ID);
    const general = await open(GENERAL_TAB_ID);
    secrets.getState().edit({ content: documentText('Traidor') });
    general.getState().edit({ content: documentText('Mapa') });
    api.document = documentFixture({ tabs: threeTabs().filter(({ id }) => id !== SECRETS_TAB_ID) });
    await store.getState().revalidate();
    expect(Object.keys(store.getState().tabEditors)).toEqual([keyOf(GENERAL_TAB_ID)]);
    expect(secrets.getState().draft).toBeNull();
    expect(general.getState().draft?.content).toEqual(documentText('Mapa'));
  });
  it('another tab edited elsewhere is read again when the document lists its new version', async () => {
    const { api, store, open } = await withThreeTabs();
    const items = await open(ITEMS_TAB_ID);
    const before = api.tabReads.length;
    await store.getState().revalidate();
    expect(api.tabReads).toHaveLength(before);
    api.writeTab(
      documentTabFixture({
        id: ITEMS_TAB_ID,
        name: 'Itens',
        version: 3,
        content: documentText('Escudo'),
      }),
    );
    await store.getState().revalidate();
    await vi.waitFor(() => expect(items.getState().draft?.content).toEqual(documentText('Escudo')));
  });
  it('a tab command goes against the document version and the next name save uses the new one', async () => {
    const { api, store } = await withThreeTabs();
    const created = await store.getState().runTabCommand({ kind: 'create', name: 'Mapas' });
    expect(created.ok && created.value.receipt.tabId).toBe('10000000-0000-4000-8000-0000000000b1');
    expect(api.tabCommands[0]).toEqual({
      operation: 'create',
      input: { actionId: DOCUMENT_ACTION_ID, expectedVersion: 0, name: 'Mapas' },
    });
    expect(store.getState().confirmed?.tabs.map(({ name }) => name)).toEqual([
      'Geral',
      'Itens',
      'Segredos',
      'Mapas',
    ]);
    store.getState().edit({ name: 'Carta nova' });
    await store.getState().flush();
    expect(api.saves[0]?.expectedVersion).toBe(1);
    expect(store.getState().status).toBe('saved');
  });
  it('opening a tab the document does not list gives no editor', async () => {
    const { store } = await withThreeTabs();
    expect(store.getState().openTab('10000000-0000-4000-8000-0000000000ff')).toBeNull();
    expect(store.getState().tabEditors).toEqual({});
  });
  it('a tab answering 404 drops its draft and reads the tab list again', async () => {
    const { api, store, open } = await withThreeTabs();
    await open(SECRETS_TAB_ID);
    const reads = api.detailCalls;
    api.tabResults[SECRETS_TAB_ID] = { ok: false, failure: { kind: 'not_found' } };
    await store.getState().tabEditors[keyOf(SECRETS_TAB_ID)]!.getState().revalidate();
    expect(store.getState().tabEditors).toEqual({});
    expect(api.detailCalls).toBe(reads + 1);
  });
});
