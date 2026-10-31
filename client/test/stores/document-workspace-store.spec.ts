// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  createDocumentWorkspaceStore,
  documentWorkspaceKey,
  sheetTemplateWorkspaceKey,
  sheetWorkspaceKey,
  workspaceItemTitle,
} from '@/stores/document-workspace-store';
import { DocumentsApiFake } from '../support/documents-api-fake';
import { documentFixture, ITEMS_TAB_ID, threeTabs } from '../support/documents-fixtures';
import { detailOf, VHARN, QUELM } from '../support/campaigns-api-fake';
import { InteractionClockFake } from '../support/interaction-clock-fake';
import { ChatWindowHostFake } from '../support/chat-window-host-fake';
import { SheetsApiFake } from '../support/sheets-api-fake';
import {
  LYRA_SHEET_ID,
  TORMENTA_TEMPLATE_ID,
  lyraSheet,
  sheetResponse,
} from '../support/sheet-fixtures';
import { SheetTemplatesApiFake } from '../support/sheet-templates-api-fake';
import { createSheetTemplateDraftStore } from '@/stores/sheet-template-draft-store';

function setup() {
  const api = new DocumentsApiFake();
  const sheetsApi = new SheetsApiFake();
  const sheetTemplatesApi = new SheetTemplatesApiFake();
  const clock = new InteractionClockFake();
  const workspace = createDocumentWorkspaceStore({ api, sheetsApi, sheetTemplatesApi, clock });
  return {
    api,
    sheetsApi,
    sheetTemplatesApi,
    clock,
    workspace,
    campaign: detailOf(VHARN),
    document: documentFixture(),
  };
}

const LYRA_SHEET = { sheetId: LYRA_SHEET_ID, sheetName: 'Lyra de Vharn' } as const;
describe('document workspace', () => {
  it('switches between document tabs and the board without discarding editor state', async () => {
    const { workspace, campaign, document } = setup();
    const key = workspace.getState().open({ campaign, document });
    const editor = workspace.getState().entries[0]!.editor;
    await editor.getState().load();
    editor.getState().edit({ name: 'Tab draft' });
    workspace.getState().activate(campaign.id, null);
    expect(workspace.getState().activeByCampaign[campaign.id]).toBeNull();
    expect(editor.getState().draft?.name).toBe('Tab draft');
    workspace.getState().open({ campaign, document, focusName: true });
    expect(workspace.getState().activeByCampaign[campaign.id]).toBe(key);
    expect(workspace.getState().entries[0]?.focusName).toBe(true);
    expect(workspace.getState().entries[0]?.editor).toBe(editor);
    workspace.getState().clear();
  });
  it('closing an active document returns its campaign to the board and preserves another campaign selection', async () => {
    const { workspace, campaign, document } = setup();
    const key = workspace.getState().open({ campaign, document });
    const other = workspace.getState().open({ campaign: detailOf(QUELM), document });
    await workspace.getState().close(key);
    expect(workspace.getState().activeByCampaign[campaign.id]).toBeNull();
    expect(workspace.getState().activeByCampaign[QUELM.id]).toBe(other);
    workspace.getState().clear();
  });
  it('server removal of a campaign clears only its own documents', async () => {
    const { workspace, campaign, document } = setup();
    workspace.getState().open({ campaign, document });
    workspace.getState().open({ campaign: detailOf(QUELM), document });
    workspace.getState().removeCampaign(campaign.id);
    expect(workspace.getState().entries.map((entry) => entry.campaign.id)).toEqual([QUELM.id]);
    workspace.getState().clear();
  });
  it('opening a document twice reuses one editor and its pending draft', async () => {
    const { workspace, campaign, document } = setup();
    const key = workspace.getState().open({ campaign, document });
    const editor = workspace.getState().entries[0]!.editor;
    await editor.getState().load();
    editor.getState().edit({ name: 'Draft' });
    workspace.getState().open({ campaign, document });
    expect(workspace.getState().entries).toHaveLength(1);
    expect(workspace.getState().entries[0]?.editor).toBe(editor);
    expect(editor.getState().draft?.name).toBe('Draft');
    expect(key).toBe(documentWorkspaceKey(campaign.id, document.id));
    workspace.getState().clear();
  });
  it('equal document ids across campaigns receive separate editors', () => {
    const { workspace, campaign, document } = setup();
    workspace.getState().open({ campaign, document });
    workspace.getState().open({ campaign: detailOf(QUELM), document });
    expect(workspace.getState().entries).toHaveLength(2);
    expect(workspace.getState().entries[0]?.editor).not.toBe(
      workspace.getState().entries[1]?.editor,
    );
    workspace.getState().clear();
  });
  it('popup opens synchronously on the user gesture and repeated requests only focus it', () => {
    const { workspace, campaign, document } = setup();
    const key = workspace.getState().open({ campaign, document });
    const host = new ChatWindowHostFake();
    workspace.getState().openWindow(key, host);
    expect(host.calls).toEqual([
      {
        url: '/chat-window.html?panel=document',
        name: `lorkarium-document-${campaign.id}:${document.id}`,
        features: 'popup,width=1000,height=800',
      },
    ]);
    workspace.getState().openWindow(key, host);
    expect(host.calls).toHaveLength(1);
    expect(host.last().focuses).toBe(1);
    workspace.getState().clear();
    expect(host.last().closed).toBe(true);
  });
  it('blocked popup retains the editor with an explicit blocked state', () => {
    const { workspace, campaign, document } = setup();
    const key = workspace.getState().open({ campaign, document });
    workspace.getState().openWindow(key, new ChatWindowHostFake(true));
    expect(workspace.getState().entries[0]).toMatchObject({
      windowBlocked: true,
      windowHandle: null,
    });
    expect(workspace.getState().entries[0]?.editor).not.toBeNull();
    workspace.getState().clear();
  });
  it('offline dirty document refuses close without discard and retains draft', async () => {
    const { workspace, campaign, document, api } = setup();
    const key = workspace.getState().open({ campaign, document });
    const editor = workspace.getState().entries[0]!.editor;
    await editor.getState().load();
    api.saveResult = { ok: false, failure: { kind: 'offline' } };
    editor.getState().edit({ name: 'Keep me' });
    expect(await workspace.getState().close(key)).toBe(false);
    expect(workspace.getState().entries[0]?.editor.getState().draft?.name).toBe('Keep me');
    workspace.getState().clear();
  });
  it('access revocation removes document metadata, draft and detached window', async () => {
    const { workspace, campaign, document, api } = setup();
    const key = workspace.getState().open({ campaign, document });
    const host = new ChatWindowHostFake();
    workspace.getState().openWindow(key, host);
    const editor = workspace.getState().entries[0]!.editor;
    await editor.getState().load();
    api.detailResult = { ok: false, failure: { kind: 'not_found' } };
    await editor.getState().revalidate();
    expect(workspace.getState().entries).toEqual([]);
    expect(editor.getState().draft).toBeNull();
    expect(host.last().closed).toBe(true);
  });
  it('remembers the tab shown in each document and forgets it when the document closes', async () => {
    const { workspace, campaign, api } = setup();
    api.document = documentFixture({ tabs: threeTabs() });
    const key = workspace.getState().open({ campaign, document: api.document });
    const other = workspace.getState().open({ campaign: detailOf(QUELM), document: api.document });
    await workspace.getState().entries[0]!.editor.getState().load();
    workspace.getState().activateTab(key, ITEMS_TAB_ID);
    workspace.getState().activateTab(key, '10000000-0000-4000-8000-0000000000ff');
    expect(workspace.getState().activeTabByDocument).toEqual({ [key]: ITEMS_TAB_ID });
    expect(workspace.getState().activeTabByDocument[other]).toBeUndefined();
    await workspace.getState().close(key);
    expect(workspace.getState().activeTabByDocument).toEqual({});
    workspace.getState().clear();
  });
});

describe('document workspace with sheets', () => {
  it('opens a sheet as its own item, named after the sheet, and reads it once', async () => {
    const { workspace, campaign, document, sheetsApi } = setup();
    workspace.getState().open({ campaign, document });
    const key = workspace.getState().openSheet({ campaign, ...LYRA_SHEET });
    expect(key).toBe(sheetWorkspaceKey(campaign.id, LYRA_SHEET_ID));
    expect(key).not.toBe(documentWorkspaceKey(campaign.id, LYRA_SHEET_ID));
    expect(workspace.getState().activeByCampaign[campaign.id]).toBe(key);
    const [sheet] = workspace.getState().sheets;
    expect(sheet && workspaceItemTitle(sheet)).toBe('Ficha · Lyra de Vharn');
    await vi.waitFor(() => expect(sheet?.store.getState().status).toBe('ready'));
    expect(sheetsApi.detailCalls).toBe(1);
    expect(workspace.getState().entries).toHaveLength(1);
    workspace.getState().clear();
  });
  it('opening the same sheet again only shows it, with the same store', () => {
    const { workspace, campaign } = setup();
    const key = workspace.getState().openSheet({ campaign, ...LYRA_SHEET });
    const store = workspace.getState().sheets[0]?.store;
    workspace.getState().activate(campaign.id, null);
    expect(workspace.getState().openSheet({ campaign, ...LYRA_SHEET })).toBe(key);
    expect(workspace.getState().sheets).toHaveLength(1);
    expect(workspace.getState().sheets[0]?.store).toBe(store);
    expect(workspace.getState().activeByCampaign[campaign.id]).toBe(key);
    workspace.getState().clear();
  });
  it('a sheet the reader may no longer see closes on its own and says why', async () => {
    const { workspace, campaign, sheetsApi } = setup();
    const key = workspace.getState().openSheet({ campaign, ...LYRA_SHEET });
    const host = new ChatWindowHostFake();
    workspace.getState().openWindow(key, host);
    const store = workspace.getState().sheets[0]!.store;
    await vi.waitFor(() => expect(store.getState().status).toBe('ready'));
    sheetsApi.detailResult = { ok: false, failure: { kind: 'not_found' } };
    await store.getState().load();
    expect(workspace.getState().sheets).toEqual([]);
    expect(workspace.getState().activeByCampaign[campaign.id]).toBeNull();
    expect(host.last().closed).toBe(true);
    expect(workspace.getState().notice).toEqual({
      campaignId: campaign.id,
      message: 'A ficha Lyra de Vharn foi fechada: ela foi excluída ou você não pode mais vê-la.',
    });
    workspace.getState().dismissNotice();
    expect(workspace.getState().notice).toBeNull();
  });
  it('a sheet renamed while open renames its tab, and the notice says the new name', async () => {
    const { workspace, campaign, sheetsApi } = setup();
    workspace.getState().openSheet({ campaign, ...LYRA_SHEET });
    const store = workspace.getState().sheets[0]!.store;
    await vi.waitFor(() => expect(store.getState().status).toBe('ready'));
    sheetsApi.response = sheetResponse(lyraSheet({ name: 'Lyra, a Arqueira', version: 2 }));
    await store.getState().load();
    const [sheet] = workspace.getState().sheets;
    expect(sheet && workspaceItemTitle(sheet)).toBe('Ficha · Lyra, a Arqueira');
    sheetsApi.detailResult = { ok: false, failure: { kind: 'not_found' } };
    await store.getState().load();
    expect(workspace.getState().notice?.message).toBe(
      'A ficha Lyra, a Arqueira foi fechada: ela foi excluída ou você não pode mais vê-la.',
    );
  });
  it('opens the sheet window on its own page and focuses it the second time', () => {
    const { workspace, campaign } = setup();
    const key = workspace.getState().openSheet({ campaign, ...LYRA_SHEET });
    const host = new ChatWindowHostFake();
    workspace.getState().openWindow(key, host);
    workspace.getState().openWindow(key, host);
    expect(host.calls).toEqual([
      {
        url: '/chat-window.html?panel=sheet',
        name: `lorkarium-sheet-${key}`,
        features: 'popup,width=720,height=800',
      },
    ]);
    expect(host.last().focuses).toBe(1);
    workspace.getState().clear();
  });
  it('closing a sheet waits for what it was gathering to be saved, then ends its store', async () => {
    const { workspace, campaign, sheetsApi } = setup();
    sheetsApi.response = sheetResponse(lyraSheet());
    const key = workspace.getState().openSheet({ campaign, ...LYRA_SHEET });
    const store = workspace.getState().sheets[0]!.store;
    await vi.waitFor(() => expect(store.getState().status).toBe('ready'));
    sheetsApi.holdSaves = true;
    void store.getState().setValues({ forca: 16 });
    const closing = workspace.getState().close(key);
    await vi.waitFor(() => expect(sheetsApi.heldSaves).toHaveLength(1));
    expect(workspace.getState().sheets).toHaveLength(1);
    sheetsApi.heldSaves[0]?.release();
    expect(await closing).toBe(true);
    expect(sheetsApi.saves.map((save) => save.changes)).toEqual([{ forca: 16 }]);
    expect(workspace.getState().sheets).toEqual([]);
  });
  it("a table removed by the server takes its sheets along, not the other table's", () => {
    const { workspace, campaign } = setup();
    workspace.getState().openSheet({ campaign, ...LYRA_SHEET });
    workspace.getState().openSheet({ campaign: detailOf(QUELM), ...LYRA_SHEET });
    workspace.getState().removeCampaign(campaign.id);
    expect(workspace.getState().sheets.map((sheet) => sheet.campaign.id)).toEqual([QUELM.id]);
    workspace.getState().clear();
    expect(workspace.getState().sheets).toEqual([]);
  });
});

const TORMENTA = { templateId: TORMENTA_TEMPLATE_ID, templateName: 'Ficha Tormenta' } as const;

async function openTormenta(setupResult: ReturnType<typeof setup>) {
  const { workspace, campaign } = setupResult;
  const key = workspace.getState().openSheetTemplate({ campaign, ...TORMENTA });
  const draft = workspace.getState().templates[0]!.draft;
  await vi.waitFor(() => expect(draft.getState().load).toBe('ready'));
  return { key, draft };
}

describe('document workspace with sheet templates', () => {
  it('opens a template editor as its own item, "Modelo · <nome>", and reads it once', async () => {
    const context = setup();
    const { key } = await openTormenta(context);
    const { workspace, campaign, sheetTemplatesApi } = context;
    expect(key).toBe(sheetTemplateWorkspaceKey(campaign.id, TORMENTA_TEMPLATE_ID));
    expect(key).not.toBe(sheetWorkspaceKey(campaign.id, TORMENTA_TEMPLATE_ID));
    expect(workspace.getState().activeByCampaign[campaign.id]).toBe(key);
    expect(workspaceItemTitle(workspace.getState().templates[0]!)).toBe('Modelo · Ficha Tormenta');
    expect(workspace.getState().openSheetTemplate({ campaign, ...TORMENTA })).toBe(key);
    expect(workspace.getState().templates).toHaveLength(1);
    expect(sheetTemplatesApi.detailCalls).toEqual([TORMENTA_TEMPLATE_ID]);
    workspace.getState().clear();
  });
  it('opening with the library draft keeps its unsaved text', async () => {
    const { workspace, campaign, sheetTemplatesApi } = setup();
    const draft = createSheetTemplateDraftStore({
      api: sheetTemplatesApi,
      campaignId: campaign.id,
      templateId: TORMENTA_TEMPLATE_ID,
    });
    await draft.getState().start();
    draft.getState().edit({ html: '<p>meu</p>' });
    workspace.getState().openSheetTemplate({ campaign, ...TORMENTA, draft });
    expect(workspace.getState().templates[0]?.draft).toBe(draft);
    expect(draft.getState().draft.html).toBe('<p>meu</p>');
    workspace.getState().clear();
  });
  it('the tab follows the saved name', async () => {
    const context = setup();
    const { draft } = await openTormenta(context);
    draft.getState().edit({ name: 'Ficha T20' });
    await draft.getState().save();
    expect(workspaceItemTitle(context.workspace.getState().templates[0]!)).toBe(
      'Modelo · Ficha T20',
    );
    context.workspace.getState().clear();
  });
  it('closing with unsaved code asks the editor; "Continuar editando" keeps it open', async () => {
    const context = setup();
    const { key, draft } = await openTormenta(context);
    const { workspace } = context;
    const asked: string[] = [];
    workspace.getState().setLeaveGuard(key, async () => {
      asked.push(key);
      return false;
    });
    draft.getState().edit({ html: '<p>meu</p>' });
    expect(await workspace.getState().close(key)).toBe(false);
    expect(asked).toEqual([key]);
    expect(workspace.getState().templates).toHaveLength(1);
    expect(draft.getState().draft.html).toBe('<p>meu</p>');
    workspace.getState().clear();
  });
  it('"Descartar" closes it and throws the text away in the shared draft too', async () => {
    const context = setup();
    const { key, draft } = await openTormenta(context);
    context.workspace.getState().setLeaveGuard(key, async () => true);
    draft.getState().edit({ html: '<p>meu</p>' });
    expect(await context.workspace.getState().close(key)).toBe(true);
    expect(context.workspace.getState().templates).toEqual([]);
    expect(draft.getState().draft.html).toBe('<p id="pv">PV</p>');
  });
  it('closing a saved template asks nothing', async () => {
    const context = setup();
    const { key } = await openTormenta(context);
    context.workspace.getState().setLeaveGuard(key, async () => false);
    expect(await context.workspace.getState().close(key)).toBe(true);
    expect(context.workspace.getState().templates).toEqual([]);
  });
  it('a template deleted while open closes its tab and window and says why', async () => {
    const context = setup();
    const { key, draft } = await openTormenta(context);
    const { workspace, campaign, sheetTemplatesApi } = context;
    const host = new ChatWindowHostFake();
    workspace.getState().openWindow(key, host);
    sheetTemplatesApi.templates.delete(TORMENTA_TEMPLATE_ID);
    await draft.getState().refresh();
    expect(workspace.getState().templates).toEqual([]);
    expect(workspace.getState().activeByCampaign[campaign.id]).toBeNull();
    expect(host.last().closed).toBe(true);
    expect(workspace.getState().notice).toEqual({
      campaignId: campaign.id,
      message: 'O modelo Ficha Tormenta foi fechado: ele foi excluído.',
    });
  });
  it('opens the template window on its own page, the editor size', async () => {
    const context = setup();
    const { key } = await openTormenta(context);
    const host = new ChatWindowHostFake();
    context.workspace.getState().openWindow(key, host);
    expect(host.calls).toEqual([
      {
        url: '/chat-window.html?panel=sheet-template',
        name: `lorkarium-sheet-template-${key}`,
        features: 'popup,width=1100,height=800',
      },
    ]);
    context.workspace.getState().clear();
  });
  it("a table removed by the server takes its templates along, not the other table's", () => {
    const { workspace, campaign } = setup();
    workspace.getState().openSheetTemplate({ campaign, ...TORMENTA });
    workspace.getState().openSheetTemplate({ campaign: detailOf(QUELM), ...TORMENTA });
    workspace.getState().removeCampaign(campaign.id);
    expect(workspace.getState().templates.map((item) => item.campaign.id)).toEqual([QUELM.id]);
    workspace.getState().clear();
    expect(workspace.getState().templates).toEqual([]);
  });
});
