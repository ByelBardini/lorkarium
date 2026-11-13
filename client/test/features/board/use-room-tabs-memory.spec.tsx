import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { useRoomTabsMemory } from '@/features/board/use-room-tabs-memory';
import {
  createDocumentWorkspaceStore,
  documentWorkspaceKey,
  mapWorkspaceKey,
  sheetTemplateWorkspaceKey,
  sheetWorkspaceKey,
  type DocumentWorkspaceStore,
} from '@/stores/document-workspace-store';
import type { OpenTable } from '@/stores/open-tables-store';
import { GROUP_TAB } from '@/stores/scene-tabs-store';
import { SCENE_TABS_STORAGE_PREFIX } from '@/stores/scene-tabs-storage';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import { DocumentsApiFake } from '../../support/documents-api-fake';
import { DOCUMENT_ID, documentFixture, summaryOfDocument } from '../../support/documents-fixtures';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { LibraryApiFake } from '../../support/library-api-fake';
import { masterLibrary } from '../../support/library-fixtures';
import { libraryMapSummary, MUNDO_ID } from '../../support/library-map-fixtures';
import { LibraryMapsApiFake } from '../../support/library-maps-api-fake';
import { ESTRADA_SCENE, TORRE_SCENE } from '../../support/scene-tab-fixtures';
import { openTorreTab, openVharnTabs } from '../../support/scene-tabs-harness';
import { LYRA_SHEET_ID, lyraSummary } from '../../support/sheet-fixtures';
import { tormentaSummary } from '../../support/sheet-template-fixtures';
import { SheetTemplatesApiFake } from '../../support/sheet-templates-api-fake';
import { SheetsApiFake } from '../../support/sheets-api-fake';
import { StorageFake } from '../../support/storage-fake';
import { TableSessionApiFake } from '../../support/table-session-api-fake';

const CAMPAIGN = detailOf(VHARN);
const DOC_KEY = documentWorkspaceKey(VHARN.id, DOCUMENT_ID);
const SHEET_KEY = sheetWorkspaceKey(VHARN.id, LYRA_SHEET_ID);
const CARTA = summaryOfDocument(documentFixture());

// The map's read is held: the tab keeps what it was opened with (`showsMainMap`).
function workspaceOfFakes(): StoreApi<DocumentWorkspaceStore> {
  const mapsApi = new LibraryMapsApiFake();
  mapsApi.heldDetails = [];
  return createDocumentWorkspaceStore({
    api: new DocumentsApiFake(),
    sheetsApi: new SheetsApiFake(),
    sheetTemplatesApi: new SheetTemplatesApiFake(),
    mapsApi,
    clock: new InteractionClockFake(),
  });
}

describe('useRoomTabsMemory across an F5', () => {
  let storage: StorageFake;
  let library: LibraryApiFake;

  beforeEach(() => {
    storage = new StorageFake();
    library = new LibraryApiFake().answer('list', {
      ok: true,
      value: masterLibrary({
        documents: [CARTA],
        sheets: [lyraSummary()],
        sheetTemplates: [tormentaSummary()],
        maps: [libraryMapSummary()],
      }),
    });
  });

  // A room over its own workspace, as the page mounts it.
  function mountRoom(table: OpenTable): StoreApi<DocumentWorkspaceStore> {
    const workspace = workspaceOfFakes();
    renderHook(() =>
      useRoomTabsMemory({ tabs: table.tabs, workspace, campaign: CAMPAIGN, library }),
    );
    return workspace;
  }

  // The Torre, then the document Carta, then Lyra's sheet; the Carta shown.
  function openBeforeReload(): OpenTable {
    const api = new TableSessionApiFake();
    const table = openVharnTabs(api, storage);
    const workspace = mountRoom(table);
    openTorreTab(api, table);
    act(() => {
      workspace.getState().open({ campaign: CAMPAIGN, document: CARTA });
      workspace
        .getState()
        .openSheet({ campaign: CAMPAIGN, sheetId: LYRA_SHEET_ID, sheetName: 'Lyra' });
      workspace.getState().activate(VHARN.id, DOC_KEY);
    });
    syncStrip(table, workspace);
    return table;
  }

  // What the strip's `useRoomTabOrderSync` does on every change of the workspace.
  function syncStrip(table: OpenTable, workspace: StoreApi<DocumentWorkspaceStore>): void {
    const { entries, sheets } = workspace.getState();
    table.tabs.getState().syncWorkspaceKeys([...entries, ...sheets].map(({ key }) => key));
  }

  async function reload(): Promise<{
    table: OpenTable;
    workspace: StoreApi<DocumentWorkspaceStore>;
  }> {
    const table = openVharnTabs(new TableSessionApiFake(), storage);
    const workspace = mountRoom(table);
    await act(() => Promise.resolve());
    syncStrip(table, workspace);
    return { table, workspace };
  }

  function strip(table: OpenTable): readonly string[] {
    return table.tabs.getState().tabOrder;
  }

  it('the grids and the items come back in their places, the one shown too', async () => {
    openBeforeReload();
    const { table, workspace } = await reload();
    expect(strip(table)).toEqual([TORRE_SCENE.id, DOC_KEY, SHEET_KEY]);
    expect(workspace.getState().entries.map(({ key }) => key)).toEqual([DOC_KEY]);
    expect(workspace.getState().activeByCampaign[VHARN.id]).toBe(DOC_KEY);
  });

  it('an item moved before a grid comes back there', async () => {
    const api = new TableSessionApiFake();
    const table = openVharnTabs(api, storage);
    const workspace = mountRoom(table);
    openTorreTab(api, table);
    act(() => void workspace.getState().open({ campaign: CAMPAIGN, document: CARTA }));
    syncStrip(table, workspace);
    table.tabs.getState().moveTab(DOC_KEY, GROUP_TAB);
    const reloaded = await reload();
    expect(strip(reloaded.table)).toEqual([DOC_KEY, TORRE_SCENE.id]);
  });

  it('an item the library no longer has is left out, and the grid before it is shown', async () => {
    // The group's grid behind the document: the Torre is shown only because it was beside it.
    openBeforeReload().tabs.getState().show(GROUP_TAB);
    library.answer('list', { ok: true, value: masterLibrary({ sheets: [lyraSummary()] }) });
    const { table, workspace } = await reload();
    expect(strip(table)).toEqual([TORRE_SCENE.id, SHEET_KEY]);
    expect(workspace.getState().activeByCampaign[VHARN.id]).toBeNull();
    expect(table.tabs.getState().visibleKey).toBe(TORRE_SCENE.id);
  });

  it('the neighbour shown can be an item: the sheet before the document gone', async () => {
    openBeforeReload().tabs.getState().moveTab(DOC_KEY, null);
    library.answer('list', { ok: true, value: masterLibrary({ sheets: [lyraSummary()] }) });
    const { workspace } = await reload();
    expect(workspace.getState().activeByCampaign[VHARN.id]).toBe(SHEET_KEY);
  });

  it('with nothing left beside it, the room falls back to the group grid', async () => {
    const table = openVharnTabs(new TableSessionApiFake(), storage);
    const workspace = mountRoom(table);
    act(() => void workspace.getState().open({ campaign: CAMPAIGN, document: CARTA }));
    library.answer('list', { ok: true, value: masterLibrary() });
    const reloaded = await reload();
    expect(reloaded.workspace.getState().entries).toEqual([]);
    expect(reloaded.workspace.getState().activeByCampaign[VHARN.id]).toBeNull();
    expect(reloaded.table.tabs.getState().visibleKey).toBe(GROUP_TAB);
  });

  it('a template a player no longer receives is left out quietly', async () => {
    const table = openVharnTabs(new TableSessionApiFake(), storage);
    const workspace = mountRoom(table);
    const template = tormentaSummary();
    act(() => {
      workspace
        .getState()
        .openSheetTemplate({ campaign: CAMPAIGN, templateId: template.id, templateName: 'T' });
    });
    expect(workspace.getState().templates.map(({ key }) => key)).toEqual([
      sheetTemplateWorkspaceKey(VHARN.id, template.id),
    ]);
    library.answer('list', { ok: true, value: masterLibrary({ sheetTemplates: undefined }) });
    const reloaded = await reload();
    expect(reloaded.workspace.getState().templates).toEqual([]);
  });

  it('the map tab comes back on its map, marked main by the library as it is now', async () => {
    const table = openVharnTabs(new TableSessionApiFake(), storage);
    const workspace = mountRoom(table);
    act(
      () =>
        void workspace
          .getState()
          .openMap({ campaign: CAMPAIGN, mapId: MUNDO_ID, mapName: 'Mundo', showsMainMap: false }),
    );
    library.answer('list', {
      ok: true,
      value: masterLibrary({ maps: [libraryMapSummary()], mainMapId: MUNDO_ID }),
    });
    const reloaded = await reload();
    const [map] = reloaded.workspace.getState().maps;
    expect(map?.key).toBe(mapWorkspaceKey(VHARN.id));
    expect(map?.showsMainMap).toBe(true);
    expect(reloaded.workspace.getState().activeByCampaign[VHARN.id]).toBe(map?.key);
  });

  it('a library that cannot be read brings no item back, and the grids stay', async () => {
    openBeforeReload();
    library.answer('list', { ok: false, failure: { kind: 'forbidden' } });
    const { table, workspace } = await reload();
    expect(strip(table)).toEqual([TORRE_SCENE.id]);
    expect(workspace.getState().entries).toEqual([]);
  });

  it('a room reopened without an F5 (the table already open) reopens nothing', async () => {
    openBeforeReload();
    const { table } = await reload();
    const listed = library.callsOf('list').length;
    mountRoom(table);
    await act(() => Promise.resolve());
    expect(library.callsOf('list')).toHaveLength(listed);
  });

  it('a storage that throws keeps the room working, the items only in memory', async () => {
    const api = new TableSessionApiFake();
    const table = openVharnTabs(api, new StorageFake(true));
    const workspace = mountRoom(table);
    act(() => void workspace.getState().open({ campaign: CAMPAIGN, document: CARTA }));
    syncStrip(table, workspace);
    table.tabs.getState().open(ESTRADA_SCENE.id);
    expect(strip(table)).toEqual([DOC_KEY, ESTRADA_SCENE.id]);
    expect(storage.values.has(`${SCENE_TABS_STORAGE_PREFIX}${VHARN.id}`)).toBe(false);
  });
});
