import { describe, expect, it } from 'vitest';
import { createDocumentEditorStore } from '@/stores/document-editor-store';
import { DocumentsApiFake } from '../support/documents-api-fake';
import { InteractionClockFake } from '../support/interaction-clock-fake';
import {
  DOCUMENT_ACTION_ID,
  DOCUMENT_CAMPAIGN_ID,
  DOCUMENT_ID,
  documentFixture,
  documentText,
  documentWrite,
} from '../support/documents-fixtures';

async function setup() {
  const api = new DocumentsApiFake();
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
    expect(api.saves).toEqual([
      { name: 'B', content: documentText('A'), actionId: DOCUMENT_ACTION_ID, expectedVersion: 0 },
    ]);
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
