import type { CampaignDetailDto, DocumentSummaryDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import type { ChatWindowHost } from '@/services/chat-window-host';
import {
  DOCUMENT_WINDOW_FEATURES,
  DOCUMENT_WINDOW_URL,
  SHEET_WINDOW_FEATURES,
  SHEET_WINDOW_URL,
  SHEET_TEMPLATE_WINDOW_FEATURES,
  SHEET_TEMPLATE_WINDOW_URL,
} from '@/services/chat-window-host';
import { createDocumentEditorStore, type DocumentEditorState } from './document-editor-store';
import { createSheetStore } from './sheet-store';
import {
  createSheetTemplateDraftStore,
  isTemplateDraftDirty,
  type SheetTemplateDraftState,
} from './sheet-template-draft-store';
import type {
  DocumentWorkspaceEntry,
  DocumentWorkspaceOptions,
  DocumentWorkspaceStore,
  SheetTemplateWorkspaceEntry,
  SheetWorkspaceEntry,
  WorkspaceItem,
  WorkspaceItemBase,
} from './document-workspace-store';

export type OpenDocument = Readonly<{
  campaign: CampaignDetailDto;
  document: DocumentSummaryDto;
  focusName?: boolean;
  /** The tab to show; without it, the one last shown. */
  tabId?: string | undefined;
}>;
export type OpenSheet = Readonly<{
  campaign: CampaignDetailDto;
  sheetId: string;
  sheetName: string;
}>;
export type OpenSheetTemplate = Readonly<{
  campaign: CampaignDetailDto;
  templateId: string;
  templateName: string;
  /** The library's draft, so its unsaved text goes with it; absent: a draft read anew. */
  draft?: StoreApi<SheetTemplateDraftState>;
}>;
export type LeaveGuard = () => Promise<boolean>;

/** What the item operations share: the store's state and what lives beside it. */
export type Workspace = Readonly<{
  set: StoreApi<DocumentWorkspaceStore>['setState'];
  get: () => DocumentWorkspaceStore;
  options: DocumentWorkspaceOptions;
  guards: Map<string, LeaveGuard>;
  subscriptions: Map<string, () => void>;
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
/** The key of a table's map tab: by table, not by map, because the tab navigates between maps. */
export function mapWorkspaceKey(campaignId: string): string {
  return `${campaignId}:map`;
}

function allItems(workspace: Workspace): readonly WorkspaceItem[] {
  const { entries, sheets, templates, maps } = workspace.get();
  return [...entries, ...sheets, ...templates, ...maps];
}

function itemOf(workspace: Workspace, key: string): WorkspaceItem | undefined {
  return allItems(workspace).find((item) => item.key === key);
}

/** Changes what every kind of item has in common, whatever its list.
 *
 *  Example: `patchItem(workspace, key, { target: element })` */
export function patchItem(
  workspace: Workspace,
  key: string,
  changes: Partial<WorkspaceItemBase>,
): void {
  workspace.set((state) => ({
    entries: state.entries.map((entry) => (entry.key === key ? { ...entry, ...changes } : entry)),
    sheets: state.sheets.map((sheet) => (sheet.key === key ? { ...sheet, ...changes } : sheet)),
    templates: state.templates.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    maps: state.maps.map((map) => (map.key === key ? { ...map, ...changes } : map)),
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

/** Shows an item of the campaign in its room, or the grids with `null`; another campaign's key
 *  is ignored.
 *
 *  Example: `activateItem(workspace, campaign.id, key)` */
export function activateItem(workspace: Workspace, campaignId: string, key: string | null): void {
  const item = key ? itemOf(workspace, key) : undefined;
  if (key && item?.campaign.id !== campaignId) return;
  workspace.set((state) => ({
    activeByCampaign: { ...state.activeByCampaign, [campaignId]: key },
  }));
}

/** Remembers the tab shown in an open document; a tab it does not list is ignored.
 *
 *  Example: `activateDocumentTab(workspace, key, tab.id)` */
export function activateDocumentTab(workspace: Workspace, key: string, tabId: string): void {
  const entry = workspace.get().entries.find((candidate) => candidate.key === key);
  if (!entry?.editor.getState().openTab(tabId)) return;
  workspace.set((state) => ({
    activeTabByDocument: { ...state.activeTabByDocument, [key]: tabId },
  }));
}

/** Opens a document as a room tab, or shows the one already open; returns its key.
 *
 *  Example: `const key = openDocument(workspace, { campaign, document })` */
export function openDocument(workspace: Workspace, input: OpenDocument): string {
  const key = documentWorkspaceKey(input.campaign.id, input.document.id);
  // Set directly, unlike a click: a document still loading lists no tab to check it against, and
  // the panel falls back to the first tab when this one is not there.
  const { tabId } = input;
  if (tabId !== undefined)
    workspace.set((state) => ({
      activeTabByDocument: { ...state.activeTabByDocument, [key]: tabId },
    }));
  if (itemOf(workspace, key)) {
    patchDocument(workspace, key, {
      campaign: input.campaign,
      ...(input.focusName ? { focusName: true } : {}),
    });
    activateItem(workspace, input.campaign.id, key);
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
  activateItem(workspace, input.campaign.id, key);
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

/** Opens a sheet as a room tab, or shows the one already open; returns its key.
 *
 *  Example: `const key = openSheet(workspace, { campaign, sheetId, sheetName })` */
export function openSheet(workspace: Workspace, input: OpenSheet): string {
  const key = sheetWorkspaceKey(input.campaign.id, input.sheetId);
  if (itemOf(workspace, key)) {
    activateItem(workspace, input.campaign.id, key);
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
  activateItem(workspace, input.campaign.id, key);
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

/** Opens a template editor as a room tab, or shows the one already open; returns its key.
 *
 *  Example: `const key = openSheetTemplate(workspace, { campaign, templateId, templateName })` */
export function openSheetTemplate(workspace: Workspace, input: OpenSheetTemplate): string {
  const key = sheetTemplateWorkspaceKey(input.campaign.id, input.templateId);
  if (itemOf(workspace, key)) {
    activateItem(workspace, input.campaign.id, key);
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
  activateItem(workspace, input.campaign.id, key);
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

export function detachedItem(key: string, campaign: CampaignDetailDto): WorkspaceItemBase {
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

/** Closes an item once it may leave; `false` when its panel or its window refused.
 *
 *  Example: `if (!(await closeItem(workspace, key))) return` */
export async function closeItem(workspace: Workspace, key: string): Promise<boolean> {
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
  if (item.kind === 'map') return true;
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

export function removeItem(workspace: Workspace, key: string): void {
  const item = itemOf(workspace, key);
  workspace.subscriptions.get(key)?.();
  workspace.subscriptions.delete(key);
  workspace.guards.delete(key);
  if (item?.kind === 'sheet') item.store.getState().dispose();
  if (item?.kind === 'document') item.editor.getState().dispose();
  if (item?.kind === 'map') item.view.getState().dispose();
  // The library may hold the same draft: what the tab threw away is gone there too.
  if (item?.kind === 'sheet-template') item.draft.getState().discard();
  const closing =
    item?.windowHandle && !item.windowHandle.closed ? item.windowHandle.close() : undefined;
  if (closing) void closing.catch(() => undefined);
  workspace.set((state) => ({
    entries: state.entries.filter((candidate) => candidate.key !== key),
    sheets: state.sheets.filter((candidate) => candidate.key !== key),
    templates: state.templates.filter((candidate) => candidate.key !== key),
    maps: state.maps.filter((candidate) => candidate.key !== key),
    activeTabByDocument: withoutKey(state.activeTabByDocument, key),
    activeByCampaign: Object.fromEntries(
      Object.entries(state.activeByCampaign).map(([campaignId, active]) => [
        campaignId,
        active === key ? null : active,
      ]),
    ),
  }));
}

/** Sets the question an item's panel asks before it closes; `null` takes it away.
 *
 *  Example: `setItemLeaveGuard(workspace, key, () => confirmLeaving())` */
export function setItemLeaveGuard(
  workspace: Workspace,
  key: string,
  guard: LeaveGuard | null,
): void {
  if (guard) workspace.guards.set(key, guard);
  else workspace.guards.delete(key);
}

const WINDOW_OF_KIND = {
  document: { url: DOCUMENT_WINDOW_URL, features: DOCUMENT_WINDOW_FEATURES },
  sheet: { url: SHEET_WINDOW_URL, features: SHEET_WINDOW_FEATURES },
  'sheet-template': { url: SHEET_TEMPLATE_WINDOW_URL, features: SHEET_TEMPLATE_WINDOW_FEATURES },
} as const;

/** Moves an item to its own window, or focuses the one already open; a map stays in its tab. Runs
 *  inside the user's gesture, or the browser blocks the pop-up.
 *
 *  Example: `openItemWindow(workspace, key, chatWindowHost)` */
export function openItemWindow(workspace: Workspace, key: string, host: ChatWindowHost): void {
  const item = itemOf(workspace, key);
  if (!item || item.kind === 'map') return;
  if (item.windowHandle && !item.windowHandle.closed) return item.windowHandle.focus();
  const { url, features } = WINDOW_OF_KIND[item.kind];
  const windowHandle = host.open(url, `lorkarium-${item.kind}-${key}`, features);
  patchItem(workspace, key, { windowHandle, windowBlocked: !windowHandle });
}

/** Drops every item without asking, as when the session ends.
 *
 *  Example: `clearWorkspaceItems(workspace)` */
export function clearWorkspaceItems(workspace: Workspace): void {
  for (const item of allItems(workspace)) removeItem(workspace, item.key);
  workspace.set({ activeByCampaign: {}, activeTabByDocument: {}, notice: null });
}

/** Drops only the items of one campaign, as when the member leaves it.
 *
 *  Example: `removeCampaignItems(workspace, campaign.id)` */
export function removeCampaignItems(workspace: Workspace, campaignId: string): void {
  for (const item of allItems(workspace))
    if (item.campaign.id === campaignId) removeItem(workspace, item.key);
}

function withoutKey(record: Readonly<Record<string, string>>, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(record).filter(([candidate]) => candidate !== key));
}
