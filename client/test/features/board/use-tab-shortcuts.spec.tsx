import { act, fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { useHomeShortcut } from '@/features/board/use-home-shortcut';
import { useTabShortcuts } from '@/features/board/use-tab-shortcuts';
import type { OpenTable } from '@/stores/open-tables-store';
import {
  createDocumentWorkspaceStore,
  type DocumentWorkspaceStore,
} from '@/stores/document-workspace-store';
import { GROUP_TAB } from '@/stores/scene-tabs-store';
import { sheetWorkspaceKey } from '@/stores/document-workspace-store';
import { LYRA_SHEET_ID } from '../../support/sheet-fixtures';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import { DocumentsApiFake } from '../../support/documents-api-fake';
import { documentFixture } from '../../support/documents-fixtures';
import { InteractionClockFake } from '../../support/interaction-clock-fake';
import { LibraryMapsApiFake } from '../../support/library-maps-api-fake';
import { MUNDO_ID, libraryMapDetail } from '../../support/library-map-fixtures';
import { TORRE_SCENE } from '../../support/scene-tab-fixtures';
import { openTorreTab, openVharnTabs } from '../../support/scene-tabs-harness';
import { SheetTemplatesApiFake } from '../../support/sheet-templates-api-fake';
import { SheetsApiFake } from '../../support/sheets-api-fake';
import { TableSessionApiFake } from '../../support/table-session-api-fake';

function workspaceOfFakes(documentsApi: DocumentsApiFake): StoreApi<DocumentWorkspaceStore> {
  const mapsApi = new LibraryMapsApiFake();
  mapsApi.maps.set(MUNDO_ID, libraryMapDetail({ isMain: true }));
  return createDocumentWorkspaceStore({
    api: documentsApi,
    sheetsApi: new SheetsApiFake(),
    sheetTemplatesApi: new SheetTemplatesApiFake(),
    mapsApi,
    clock: new InteractionClockFake(),
  });
}

type Room = Readonly<{
  table: OpenTable;
  workspace: StoreApi<DocumentWorkspaceStore>;
  documentsApi: DocumentsApiFake;
}>;

function room(desktop = true): Room {
  const api = new TableSessionApiFake();
  const table = openVharnTabs(api);
  openTorreTab(api, table);
  table.tabs.getState().show(GROUP_TAB);
  const documentsApi = new DocumentsApiFake();
  const workspace = workspaceOfFakes(documentsApi);
  renderHook(() => useTabShortcuts({ campaignId: VHARN.id, tabs: table.tabs, workspace, desktop }));
  return { table, workspace, documentsApi };
}

function pressCtrl(key: string, init: KeyboardEventInit = {}): boolean {
  return fireEvent.keyDown(document.body, { key, ctrlKey: true, ...init });
}

function shownKey(table: OpenTable, workspace: StoreApi<DocumentWorkspaceStore>): string {
  return workspace.getState().activeByCampaign[VHARN.id] ?? table.tabs.getState().visibleKey;
}

describe('useTabShortcuts in the desktop shell', () => {
  it('Ctrl+Tab on the group shows the Torre and keeps the key from the page', () => {
    const { table, workspace } = room();
    const notPrevented = pressCtrl('Tab');
    expect(shownKey(table, workspace)).toBe(TORRE_SCENE.id);
    expect(notPrevented).toBe(false);
  });

  it('Ctrl+Shift+Tab wraps to the last tab, Ctrl+1 goes back to the group', () => {
    const { table, workspace } = room();
    const doc = workspace
      .getState()
      .open({ campaign: detailOf(VHARN), document: documentFixture() });
    act(() => table.tabs.getState().show(GROUP_TAB));
    act(() => workspace.getState().activate(VHARN.id, null));
    pressCtrl('Tab', { shiftKey: true });
    expect(shownKey(table, workspace)).toBe(doc);
    pressCtrl('1');
    expect(shownKey(table, workspace)).toBe(GROUP_TAB);
  });

  it('Ctrl+W on the Torre closes it and shows the tab before', () => {
    const { table, workspace } = room();
    act(() => table.tabs.getState().show(TORRE_SCENE.id));
    pressCtrl('w');
    expect(table.tabs.getState().tabs.map(({ key }) => key)).toEqual([GROUP_TAB]);
    expect(shownKey(table, workspace)).toBe(GROUP_TAB);
  });

  it('Ctrl+W on a document with a pending draft asks it and does not close quietly', async () => {
    const { workspace, documentsApi } = room();
    const doc = workspace
      .getState()
      .open({ campaign: detailOf(VHARN), document: documentFixture() });
    const editor = workspace.getState().entries[0]!.editor;
    await act(() => editor.getState().load());
    documentsApi.saveResult = { ok: false, failure: { kind: 'offline' } };
    act(() => editor.getState().edit({ name: 'Rascunho' }));
    let asked = 0;
    workspace.getState().setLeaveGuard(doc, async () => {
      asked += 1;
      return false;
    });
    pressCtrl('w');
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(asked).toBe(1);
    expect(workspace.getState().entries.map(({ key }) => key)).toContain(doc);
  });

  it('Ctrl+Tab and Ctrl+N follow the order on screen: a document moved before the Torre', () => {
    const { table, workspace } = room();
    const doc = workspace
      .getState()
      .open({ campaign: detailOf(VHARN), document: documentFixture() });
    // The strip keeps the order up with the workspace (`useRoomTabOrderSync`).
    act(() => table.tabs.getState().syncWorkspaceKeys([doc]));
    act(() => table.tabs.getState().moveTab(doc, TORRE_SCENE.id));
    act(() => workspace.getState().activate(VHARN.id, null));
    pressCtrl('Tab');
    expect(shownKey(table, workspace)).toBe(doc);
    pressCtrl('3');
    expect(shownKey(table, workspace)).toBe(TORRE_SCENE.id);
  });

  it('Ctrl+W on the group closes nothing', () => {
    const { table } = room();
    pressCtrl('w');
    expect(table.tabs.getState().tabs).toHaveLength(2);
  });

  it('in a dialog the keys are left alone', () => {
    const { table, workspace } = room();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    expect(fireEvent.keyDown(dialog, { key: 'Tab', ctrlKey: true })).toBe(true);
    expect(shownKey(table, workspace)).toBe(GROUP_TAB);
    dialog.remove();
  });
});

describe('useTabShortcuts in a browser', () => {
  it('handles no key and prevents nothing', () => {
    const { table, workspace } = room(false);
    expect(pressCtrl('Tab')).toBe(true);
    expect(pressCtrl('w')).toBe(true);
    expect(shownKey(table, workspace)).toBe(GROUP_TAB);
    expect(table.tabs.getState().tabs).toHaveLength(2);
  });
});

describe('Shift+M and Shift+F go back to the tab before', () => {
  function home() {
    const { table, workspace } = room(false);
    const deps = { campaignId: VHARN.id, tabs: table.tabs, workspace };
    const openMap = (): void =>
      void workspace.getState().openMap({
        campaign: detailOf(VHARN),
        mapId: MUNDO_ID,
        mapName: 'Mundo',
        showsMainMap: true,
      });
    const mapKey = (): string | null => workspace.getState().maps[0]?.key ?? null;
    const { rerender } = renderHook(() => {
      const shown = shownKey(table, workspace) === mapKey();
      useHomeShortcut('main-map', openMap, { shown, room: deps });
    });
    const press = (): void => {
      act(() => void fireEvent.keyDown(document.body, { key: 'M', shiftKey: true }));
      rerender();
    };
    return { table, workspace, mapKey, press };
  }

  it('the Torre shown, Shift+M opens the main map, and again goes back to the Torre', () => {
    const { table, workspace, mapKey, press } = home();
    act(() => table.tabs.getState().show(TORRE_SCENE.id));
    press();
    expect(shownKey(table, workspace)).toBe(mapKey());
    press();
    expect(shownKey(table, workspace)).toBe(TORRE_SCENE.id);
  });

  it('the tab before closed meanwhile, it stays on the map', () => {
    const { table, workspace, mapKey, press } = home();
    act(() => table.tabs.getState().show(TORRE_SCENE.id));
    press();
    act(() => table.tabs.getState().close(TORRE_SCENE.id));
    press();
    expect(shownKey(table, workspace)).toBe(mapKey());
  });
});

describe('Shift+F goes back to the tab before', () => {
  function sheetHome(withSheet = true) {
    const { table, workspace } = room(false);
    const openSheet = (): string =>
      workspace
        .getState()
        .openSheet({ campaign: detailOf(VHARN), sheetId: LYRA_SHEET_ID, sheetName: 'Lyra' });
    const sheetKey = sheetWorkspaceKey(VHARN.id, LYRA_SHEET_ID);
    const deps = { campaignId: VHARN.id, tabs: table.tabs, workspace, mainSheetKey: sheetKey };
    const { rerender } = renderHook(() => {
      const shown = shownKey(table, workspace) === sheetKey;
      useHomeShortcut('main-sheet', withSheet ? openSheet : null, { shown, room: deps });
    });
    const press = (): boolean => {
      let notPrevented = true;
      act(() => {
        notPrevented = fireEvent.keyDown(document.body, { key: 'F', shiftKey: true });
      });
      rerender();
      return notPrevented;
    };
    return { table, workspace, sheetKey, press };
  }

  it('the Torre shown, Shift+F opens the main sheet, and again goes back to the Torre', () => {
    const { table, workspace, sheetKey, press } = sheetHome();
    act(() => table.tabs.getState().show(TORRE_SCENE.id));
    press();
    expect(shownKey(table, workspace)).toBe(sheetKey);
    press();
    expect(shownKey(table, workspace)).toBe(TORRE_SCENE.id);
  });

  it('with no main sheet, Shift+F does nothing', () => {
    const { table, workspace, press } = sheetHome(false);
    act(() => table.tabs.getState().show(TORRE_SCENE.id));
    expect(press()).toBe(true);
    expect(shownKey(table, workspace)).toBe(TORRE_SCENE.id);
    expect(workspace.getState().sheets).toHaveLength(0);
  });
});
