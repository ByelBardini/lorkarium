import type { CampaignDetailDto, DocumentSummaryDto } from '@lorkarium/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { useCallback, useSyncExternalStore } from 'react';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { DocumentsApi } from '@/services/documents-api';
import type { LibraryMapsApi } from '@/services/library-maps-api';
import type { SheetsApi } from '@/services/sheets-api';
import type { SheetTemplatesApi } from '@/services/sheet-templates-api';
import type { ChatWindowHandle, ChatWindowHost } from '@/services/chat-window-host';
import type { DocumentEditorState } from './document-editor-store';
import type { MapViewState } from './map-view-store';
import type { SheetStoreState } from './sheet-store';
import type { SheetTemplateDraftState } from './sheet-template-draft-store';
import {
  activateDocumentTab,
  activateItem,
  clearWorkspaceItems,
  closeItem,
  openDocument,
  openItemWindow,
  openSheet,
  openSheetTemplate,
  patchItem,
  removeCampaignItems,
  setItemLeaveGuard,
  type LeaveGuard,
  type OpenDocument,
  type OpenSheet,
  type OpenSheetTemplate,
  type Workspace,
} from './document-workspace-ops';
import { openMap, type OpenMap } from './document-workspace-map-ops';

export {
  documentWorkspaceKey,
  mapWorkspaceKey,
  sheetTemplateWorkspaceKey,
  sheetWorkspaceKey,
} from './document-workspace-ops';

/** What every item of the workspace has: where its panel goes (the room tab or its window). */
export type WorkspaceItemBase = Readonly<{
  key: string;
  campaign: CampaignDetailDto;
  target: HTMLElement | null;
  windowHandle: ChatWindowHandle | null;
  windowBlocked: boolean;
  closeProblem: string | null;
}>;
export type DocumentWorkspaceEntry = WorkspaceItemBase &
  Readonly<{
    kind: 'document';
    document: DocumentSummaryDto;
    editor: StoreApi<DocumentEditorState>;
    focusName: boolean;
  }>;
export type SheetWorkspaceEntry = WorkspaceItemBase &
  Readonly<{
    kind: 'sheet';
    sheetId: string;
    /** The sheet's confirmed name: the tab says "Ficha · <name>". */
    sheetName: string;
    store: StoreApi<SheetStoreState>;
  }>;
export type SheetTemplateWorkspaceEntry = WorkspaceItemBase &
  Readonly<{
    kind: 'sheet-template';
    templateId: string;
    /** The confirmed name: the tab says "Modelo · <name>". */
    templateName: string;
    draft: StoreApi<SheetTemplateDraftState>;
  }>;
/** The table's one map tab: it navigates, so opening another map reuses it. */
export type MapWorkspaceEntry = WorkspaceItemBase &
  Readonly<{
    kind: 'map';
    /** The confirmed name of the map shown: the tab's title. */
    mapName: string;
    /** The map shown is the table's main one: the strip draws no tab, the table's name plays it. */
    showsMainMap: boolean;
    view: StoreApi<MapViewState>;
  }>;
export type WorkspaceItem =
  DocumentWorkspaceEntry | SheetWorkspaceEntry | SheetTemplateWorkspaceEntry | MapWorkspaceEntry;
/** The items that can move to a window of their own; a map cannot. */
export type WindowedWorkspaceItem = Exclude<WorkspaceItem, MapWorkspaceEntry>;
/** Said once in the room after the workspace closed an item on its own. */
export type WorkspaceNotice = Readonly<{ campaignId: string; message: string }>;
export type DocumentWorkspaceStore = Readonly<{
  entries: readonly DocumentWorkspaceEntry[];
  sheets: readonly SheetWorkspaceEntry[];
  templates: readonly SheetTemplateWorkspaceEntry[];
  /** At most one per table. */
  maps: readonly MapWorkspaceEntry[];
  activeByCampaign: Readonly<Record<string, string | null>>;
  /** The tab last shown in each open document, by entry key; survives the panel moving
   *  between the room tab and its window. */
  activeTabByDocument: Readonly<Record<string, string>>;
  notice: WorkspaceNotice | null;
  activate: (campaignId: string, key: string | null) => void;
  activateTab: (key: string, tabId: string) => void;
  open: (input: OpenDocument) => string;
  openSheet: (input: OpenSheet) => string;
  /** The master's template editor as a room tab; reopening shows the one already open. */
  openSheetTemplate: (input: OpenSheetTemplate) => string;
  /** The table's map tab showing this map; reopening reuses the tab. */
  openMap: (input: OpenMap) => string;
  close: (key: string) => Promise<boolean>;
  setTarget: (key: string, target: HTMLElement | null) => void;
  setLeaveGuard: (key: string, guard: LeaveGuard | null) => void;
  openWindow: (key: string, host: ChatWindowHost) => void;
  dismissNotice: () => void;
  clear: () => void;
  removeCampaign: (campaignId: string) => void;
}>;
export type DocumentWorkspaceOptions = Readonly<{
  api: DocumentsApi;
  sheetsApi: SheetsApi;
  sheetTemplatesApi: SheetTemplatesApi;
  mapsApi: LibraryMapsApi;
  clock: InteractionClock;
  newActionId?: () => string;
}>;
/** The name of an item's tab and window. Example: `workspaceItemTitle(entry) // 'Ficha · Lyra'` */
export function workspaceItemTitle(item: WorkspaceItem): string {
  if (item.kind === 'sheet') return `Ficha · ${item.sheetName}`;
  if (item.kind === 'sheet-template') return `Modelo · ${item.templateName}`;
  if (item.kind === 'map') return item.mapName;
  return item.document.name;
}
export function useDocumentWorkspaceSlice<T>(
  store: StoreApi<DocumentWorkspaceStore> | undefined,
  pick: (state: DocumentWorkspaceStore) => T,
  fallback: T,
): T {
  const subscribe = useCallback(
    (changed: () => void) => store?.subscribe(changed) ?? (() => undefined),
    [store],
  );
  return useSyncExternalStore(subscribe, () => (store ? pick(store.getState()) : fallback));
}

export function createDocumentWorkspaceStore(
  options: DocumentWorkspaceOptions,
): StoreApi<DocumentWorkspaceStore> {
  return createStore<DocumentWorkspaceStore>()((set, get) => {
    const workspace: Workspace = { set, get, options, guards: new Map(), subscriptions: new Map() };
    return {
      entries: [],
      sheets: [],
      templates: [],
      maps: [],
      activeByCampaign: {},
      activeTabByDocument: {},
      notice: null,
      activate: (campaignId, key) => activateItem(workspace, campaignId, key),
      activateTab: (key, tabId) => activateDocumentTab(workspace, key, tabId),
      open: (input) => openDocument(workspace, input),
      openSheet: (input) => openSheet(workspace, input),
      openSheetTemplate: (input) => openSheetTemplate(workspace, input),
      openMap: (input) => openMap(workspace, input),
      close: (key) => closeItem(workspace, key),
      setTarget: (key, target) => patchItem(workspace, key, { target }),
      setLeaveGuard: (key, guard) => setItemLeaveGuard(workspace, key, guard),
      openWindow: (key, host) => openItemWindow(workspace, key, host),
      dismissNotice: () => set({ notice: null }),
      clear: () => clearWorkspaceItems(workspace),
      removeCampaign: (campaignId) => removeCampaignItems(workspace, campaignId),
    };
  });
}
