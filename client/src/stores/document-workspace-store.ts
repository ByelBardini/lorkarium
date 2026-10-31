import type { CampaignDetailDto, DocumentSummaryDto } from '@lorkarium/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { useCallback, useSyncExternalStore } from 'react';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { DocumentsApi } from '@/services/documents-api';
import type { SheetsApi } from '@/services/sheets-api';
import type { SheetTemplatesApi } from '@/services/sheet-templates-api';
import type { ChatWindowHandle, ChatWindowHost } from '@/services/chat-window-host';
import {
  DOCUMENT_WINDOW_FEATURES,
  DOCUMENT_WINDOW_URL,
  SHEET_WINDOW_FEATURES,
  SHEET_WINDOW_URL,
  SHEET_TEMPLATE_WINDOW_FEATURES,
  SHEET_TEMPLATE_WINDOW_URL,
} from '@/services/chat-window-host';
import { createDocumentEditorStore, type DocumentEditorState } from './document-editor-store';
import { createSheetStore, type SheetStoreState } from './sheet-store';
import {
  createSheetTemplateDraftStore,
  isTemplateDraftDirty,
  type SheetTemplateDraftState,
} from './sheet-template-draft-store';

/** What every item of the workspace has: where its panel goes (the room tab or its window). */
type WorkspaceItemBase = Readonly<{
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
export type WorkspaceItem =
  DocumentWorkspaceEntry | SheetWorkspaceEntry | SheetTemplateWorkspaceEntry;
/** Said once in the room after the workspace closed an item on its own. */
export type WorkspaceNotice = Readonly<{ campaignId: string; message: string }>;
type OpenDocument = Readonly<{
  campaign: CampaignDetailDto;
  document: DocumentSummaryDto;
  focusName?: boolean;
}>;
type OpenSheet = Readonly<{ campaign: CampaignDetailDto; sheetId: string; sheetName: string }>;
type OpenSheetTemplate = Readonly<{
  campaign: CampaignDetailDto;
  templateId: string;
  templateName: string;
  /** The library's draft, so its unsaved text goes with it; absent: a draft read anew. */
  draft?: StoreApi<SheetTemplateDraftState>;
}>;
type LeaveGuard = () => Promise<boolean>;
export type DocumentWorkspaceStore = Readonly<{
  entries: readonly DocumentWorkspaceEntry[];
  sheets: readonly SheetWorkspaceEntry[];
  templates: readonly SheetTemplateWorkspaceEntry[];
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
  clock: InteractionClock;
  newActionId?: () => string;
}>;
export function documentWorkspaceKey(campaignId: string, documentId: string): string {
  return `${campaignId}:${documentId}`;
}
/** The key of a sheet's item; never equal to a document's (`sheet:` in the middle). */
export function sheetWorkspaceKey(campaignId: string, sheetId: string): string {
  return `${campaignId}:sheet:${sheetId}`;
}
/** The key of a template editor's item (`sheet-template:` in the middle). */
export function sheetTemplateWorkspaceKey(campaignId: string, templateId: string): string {
  return `${campaignId}:sheet-template:${templateId}`;
}
/** The name of an item's tab and window. Example: `workspaceItemTitle(entry) // 'Ficha · Lyra'` */
export function workspaceItemTitle(item: WorkspaceItem): string {
  if (item.kind === 'sheet') return `Ficha · ${item.sheetName}`;
  if (item.kind === 'sheet-template') return `Modelo · ${item.templateName}`;
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

type Set = StoreApi<DocumentWorkspaceStore>['setState'];
type Get = () => DocumentWorkspaceStore;
type Workspace = Readonly<{
  set: Set;
  get: Get;
  options: DocumentWorkspaceOptions;
  guards: Map<string, LeaveGuard>;
  subscriptions: Map<string, () => void>;
}>;

export function createDocumentWorkspaceStore(
  options: DocumentWorkspaceOptions,
): StoreApi<DocumentWorkspaceStore> {
  return createStore<DocumentWorkspaceStore>()((set, get) => {
    const workspace: Workspace = { set, get, options, guards: new Map(), subscriptions: new Map() };
    return {
      entries: [],
      sheets: [],
      templates: [],
      activeByCampaign: {},
      activeTabByDocument: {},
      notice: null,
      activate: (campaignId, key) => activate(workspace, campaignId, key),
      activateTab: (key, tabId) => activateTab(workspace, key, tabId),
      open: (input) => openDocument(workspace, input),
      openSheet: (input) => openSheet(workspace, input),
      openSheetTemplate: (input) => openSheetTemplate(workspace, input),
      close: (key) => closeItem(workspace, key),
      setTarget: (key, target) => patchItem(workspace, key, { target }),
      setLeaveGuard: (key, guard) => setLeaveGuard(workspace, key, guard),
      openWindow: (key, host) => openWindow(workspace, key, host),
      dismissNotice: () => set({ notice: null }),
      clear: () => clear(workspace),
      removeCampaign: (campaignId) => removeCampaign(workspace, campaignId),
    };
  });
}

function allItems(workspace: Workspace): readonly WorkspaceItem[] {
  const { entries, sheets, templates } = workspace.get();
  return [...entries, ...sheets, ...templates];
}

function itemOf(workspace: Workspace, key: string): WorkspaceItem | undefined {
  return allItems(workspace).find((item) => item.key === key);
}

function patchItem(workspace: Workspace, key: string, changes: Partial<WorkspaceItemBase>): void {
  workspace.set((state) => ({
    entries: state.entries.map((entry) => (entry.key === key ? { ...entry, ...changes } : entry)),
    sheets: state.sheets.map((sheet) => (sheet.key === key ? { ...sheet, ...changes } : sheet)),
    templates: state.templates.map((item) => (item.key === key ? { ...item, ...changes } : item)),
  }));
}

function patchDocument(
  workspace: Workspace,
  key: string,
  changes: Partial<DocumentWorkspaceEntry>,
): void {
  workspace.set((state) => ({
    entries: state.entries.map((entry) => (entry.key === key ? { ...entry, ...changes } : entry)),
  }));
}

function activate(workspace: Workspace, campaignId: string, key: string | null): void {
  const item = key ? itemOf(workspace, key) : undefined;
  if (key && item?.campaign.id !== campaignId) return;
  workspace.set((state) => ({
    activeByCampaign: { ...state.activeByCampaign, [campaignId]: key },
  }));
}

function activateTab(workspace: Workspace, key: string, tabId: string): void {
  const entry = workspace.get().entries.find((candidate) => candidate.key === key);
  if (!entry?.editor.getState().openTab(tabId)) return;
  workspace.set((state) => ({
    activeTabByDocument: { ...state.activeTabByDocument, [key]: tabId },
  }));
}

function openDocument(workspace: Workspace, input: OpenDocument): string {
  const key = documentWorkspaceKey(input.campaign.id, input.document.id);
  if (itemOf(workspace, key)) {
    patchDocument(workspace, key, {
      campaign: input.campaign,
      ...(input.focusName ? { focusName: true } : {}),
    });
    activate(workspace, input.campaign.id, key);
    return key;
  }
  const editor = createDocumentEditorStore({
    ...workspace.options,
    campaignId: input.campaign.id,
    documentId: input.document.id,
    newActionId: newActionIdOf(workspace.options),
  });
  const entry: DocumentWorkspaceEntry = {
    ...detachedItem(key, input.campaign),
    kind: 'document',
    document: input.document,
    editor,
    focusName: input.focusName ?? false,
  };
  workspace.set((state) => ({ entries: [...state.entries, entry] }));
  activate(workspace, input.campaign.id, key);
  workspace.subscriptions.set(key, followEditor(workspace, key, editor));
  void editor.getState().load();
  return key;
}

function followEditor(
  workspace: Workspace,
  key: string,
  editor: StoreApi<DocumentEditorState>,
): () => void {
  return editor.subscribe((state, previous) => {
    if (state.status === 'not_found') return removeItem(workspace, key);
    if (state.confirmed && state.confirmed !== previous.confirmed)
      patchDocument(workspace, key, { document: state.confirmed });
  });
}

function openSheet(workspace: Workspace, input: OpenSheet): string {
  const key = sheetWorkspaceKey(input.campaign.id, input.sheetId);
  if (itemOf(workspace, key)) {
    activate(workspace, input.campaign.id, key);
    return key;
  }
  const store = createSheetStore({
    api: workspace.options.sheetsApi,
    campaignId: input.campaign.id,
    sheetId: input.sheetId,
    clock: workspace.options.clock,
    newActionId: newActionIdOf(workspace.options),
  });
  const entry: SheetWorkspaceEntry = {
    ...detachedItem(key, input.campaign),
    kind: 'sheet',
    sheetId: input.sheetId,
    sheetName: input.sheetName,
    store,
  };
  workspace.set((state) => ({ sheets: [...state.sheets, entry] }));
  activate(workspace, input.campaign.id, key);
  workspace.subscriptions.set(key, followSheet(workspace, entry));
  void store.getState().load();
  return key;
}

// A sheet the reader may no longer see (deleted, given away, control lost, made private) reads
// as 404; a renamed one renames its tab.
function followSheet(workspace: Workspace, entry: SheetWorkspaceEntry): () => void {
  return entry.store.subscribe((state) => {
    const name = sheetNameOf(workspace, entry.key) ?? entry.sheetName;
    if (state.status === 'not_found') return closeLostSheet(workspace, entry, name);
    if (state.sheet && state.sheet.name !== name)
      patchSheetName(workspace, entry.key, state.sheet.name);
  });
}

function sheetNameOf(workspace: Workspace, key: string): string | undefined {
  return workspace.get().sheets.find((item) => item.key === key)?.sheetName;
}

function patchSheetName(workspace: Workspace, key: string, sheetName: string): void {
  workspace.set((state) => ({
    sheets: state.sheets.map((item) => (item.key === key ? { ...item, sheetName } : item)),
  }));
}

function closeLostSheet(workspace: Workspace, entry: SheetWorkspaceEntry, name: string): void {
  removeItem(workspace, entry.key);
  workspace.set({
    notice: {
      campaignId: entry.campaign.id,
      message: `A ficha ${name} foi fechada: ela foi excluída ou você não pode mais vê-la.`,
    },
  });
}

function openSheetTemplate(workspace: Workspace, input: OpenSheetTemplate): string {
  const key = sheetTemplateWorkspaceKey(input.campaign.id, input.templateId);
  if (itemOf(workspace, key)) {
    activate(workspace, input.campaign.id, key);
    return key;
  }
  const draft = input.draft ?? newTemplateDraft(workspace, input);
  const entry: SheetTemplateWorkspaceEntry = {
    ...detachedItem(key, input.campaign),
    kind: 'sheet-template',
    templateId: input.templateId,
    templateName: draft.getState().base?.name ?? input.templateName,
    draft,
  };
  workspace.set((state) => ({ templates: [...state.templates, entry] }));
  activate(workspace, input.campaign.id, key);
  workspace.subscriptions.set(key, followTemplate(workspace, entry));
  void draft.getState().start();
  return key;
}

function newTemplateDraft(
  workspace: Workspace,
  input: OpenSheetTemplate,
): StoreApi<SheetTemplateDraftState> {
  return createSheetTemplateDraftStore({
    api: workspace.options.sheetTemplatesApi,
    campaignId: input.campaign.id,
    templateId: input.templateId,
  });
}

// A template deleted while open (by this master in the library, or another) reads as 404.
function followTemplate(workspace: Workspace, entry: SheetTemplateWorkspaceEntry): () => void {
  return entry.draft.subscribe((state) => {
    if (state.load === 'not_found') return closeDeletedTemplate(workspace, entry);
    const name = state.base?.name;
    if (name && name !== templateNameOf(workspace, entry.key))
      patchTemplateName(workspace, entry.key, name);
  });
}

function templateNameOf(workspace: Workspace, key: string): string | undefined {
  return workspace.get().templates.find((item) => item.key === key)?.templateName;
}

function patchTemplateName(workspace: Workspace, key: string, templateName: string): void {
  workspace.set((state) => ({
    templates: state.templates.map((item) => (item.key === key ? { ...item, templateName } : item)),
  }));
}

function closeDeletedTemplate(workspace: Workspace, entry: SheetTemplateWorkspaceEntry): void {
  const name = templateNameOf(workspace, entry.key) ?? entry.templateName;
  removeItem(workspace, entry.key);
  workspace.set({
    notice: {
      campaignId: entry.campaign.id,
      message: `O modelo ${name} foi fechado: ele foi excluído.`,
    },
  });
}

function detachedItem(key: string, campaign: CampaignDetailDto): WorkspaceItemBase {
  return {
    key,
    campaign,
    target: null,
    windowHandle: null,
    windowBlocked: false,
    closeProblem: null,
  };
}

function newActionIdOf(options: DocumentWorkspaceOptions): () => string {
  return options.newActionId ?? (() => crypto.randomUUID());
}

async function closeItem(workspace: Workspace, key: string): Promise<boolean> {
  const item = itemOf(workspace, key);
  if (!item) return true;
  if (!(await mayLeave(workspace, item))) return false;
  try {
    if (item.windowHandle && !item.windowHandle.closed) await item.windowHandle.close();
  } catch {
    patchItem(workspace, key, {
      closeProblem: 'Não foi possível fechar a janela. Tente novamente.',
    });
    return false;
  }
  removeItem(workspace, key);
  return true;
}

// A sheet saves on its own; a document with a draft it could not save, or a template with unsaved
// code, asks its panel first.
async function mayLeave(workspace: Workspace, item: WorkspaceItem): Promise<boolean> {
  if (item.kind === 'sheet-template') {
    if (!isTemplateDraftDirty(item.draft.getState())) return true;
    return (await workspace.guards.get(item.key)?.()) ?? false;
  }
  if (item.kind === 'sheet') {
    await item.store.getState().flush();
    return true;
  }
  await item.editor.getState().flush();
  if (!item.editor.getState().dirty) return true;
  return (await workspace.guards.get(item.key)?.()) ?? false;
}

function removeItem(workspace: Workspace, key: string): void {
  const item = itemOf(workspace, key);
  workspace.subscriptions.get(key)?.();
  workspace.subscriptions.delete(key);
  workspace.guards.delete(key);
  if (item?.kind === 'sheet') item.store.getState().dispose();
  if (item?.kind === 'document') item.editor.getState().dispose();
  // The library may hold the same draft: what the tab threw away is gone there too.
  if (item?.kind === 'sheet-template') item.draft.getState().discard();
  const closing =
    item?.windowHandle && !item.windowHandle.closed ? item.windowHandle.close() : undefined;
  if (closing) void closing.catch(() => undefined);
  workspace.set((state) => ({
    entries: state.entries.filter((candidate) => candidate.key !== key),
    sheets: state.sheets.filter((candidate) => candidate.key !== key),
    templates: state.templates.filter((candidate) => candidate.key !== key),
    activeTabByDocument: withoutKey(state.activeTabByDocument, key),
    activeByCampaign: Object.fromEntries(
      Object.entries(state.activeByCampaign).map(([campaignId, active]) => [
        campaignId,
        active === key ? null : active,
      ]),
    ),
  }));
}

function setLeaveGuard(workspace: Workspace, key: string, guard: LeaveGuard | null): void {
  if (guard) workspace.guards.set(key, guard);
  else workspace.guards.delete(key);
}

const WINDOW_OF_KIND = {
  document: { url: DOCUMENT_WINDOW_URL, features: DOCUMENT_WINDOW_FEATURES },
  sheet: { url: SHEET_WINDOW_URL, features: SHEET_WINDOW_FEATURES },
  'sheet-template': { url: SHEET_TEMPLATE_WINDOW_URL, features: SHEET_TEMPLATE_WINDOW_FEATURES },
} as const;

function openWindow(workspace: Workspace, key: string, host: ChatWindowHost): void {
  const item = itemOf(workspace, key);
  if (!item) return;
  if (item.windowHandle && !item.windowHandle.closed) return item.windowHandle.focus();
  const { url, features } = WINDOW_OF_KIND[item.kind];
  const windowHandle = host.open(url, `lorkarium-${item.kind}-${key}`, features);
  patchItem(workspace, key, { windowHandle, windowBlocked: !windowHandle });
}

function clear(workspace: Workspace): void {
  for (const item of allItems(workspace)) removeItem(workspace, item.key);
  workspace.set({ activeByCampaign: {}, activeTabByDocument: {}, notice: null });
}

function removeCampaign(workspace: Workspace, campaignId: string): void {
  for (const item of allItems(workspace))
    if (item.campaign.id === campaignId) removeItem(workspace, item.key);
}

function withoutKey(record: Readonly<Record<string, string>>, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(record).filter(([candidate]) => candidate !== key));
}
