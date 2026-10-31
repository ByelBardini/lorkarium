import type {
  DocumentContentDto,
  DocumentDto,
  DocumentTabDto,
  DocumentTabVisibilityDto,
  DocumentWriteResponseDto,
} from '@lorkarium/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { DocumentsApi, DocumentsResult } from '@/services/documents-api';
import {
  createVersionedDraftStore,
  type DocumentSaveStatus,
  type VersionedDraftSource,
  type VersionedDraftState,
} from './versioned-draft-store';

export type { DocumentSaveStatus } from './versioned-draft-store';
export type DocumentNameDraft = Readonly<{ name: string }>;
export type DocumentTabDraft = Readonly<{ content: DocumentContentDto }>;
export type DocumentTabEditorState = VersionedDraftState<DocumentTabDto, DocumentTabDraft>;
/** A change to the tab list, sent against the document's version. */
export type DocumentTabCommand =
  | Readonly<{ kind: 'create'; name?: string }>
  | Readonly<{ kind: 'rename'; tabId: string; name: string }>
  | Readonly<{ kind: 'visibility'; tabId: string; visibility: DocumentTabVisibilityDto }>
  | Readonly<{ kind: 'reorder'; tabIds: readonly string[] }>
  | Readonly<{ kind: 'remove'; tabId: string }>;
export type DocumentEditorState = Readonly<{
  confirmed: DocumentDto | null;
  /** The document name's draft; each tab body has its own editor in `tabEditors`. */
  draft: DocumentNameDraft | null;
  /** The name's save status. */
  status: DocumentSaveStatus;
  /** The name or any opened tab has unsaved changes. */
  dirty: boolean;
  /** One editor per opened tab, by `documentTabEditorKey`. */
  tabEditors: Readonly<Record<string, StoreApi<DocumentTabEditorState>>>;
  load: () => Promise<void>;
  edit: (change: Partial<DocumentNameDraft>) => void;
  flush: () => Promise<void>;
  revalidate: () => Promise<void>;
  setLive: (live: boolean) => void;
  discard: () => Promise<void>;
  dispose: () => void;
  /** Saves the other tabs' pending bodies and returns this tab's editor (null: no such tab). */
  openTab: (tabId: string) => StoreApi<DocumentTabEditorState> | null;
  runTabCommand: (
    command: DocumentTabCommand,
  ) => Promise<DocumentsResult<DocumentWriteResponseDto>>;
}>;
export type DocumentEditorOptions = Readonly<{
  api: DocumentsApi;
  campaignId: string;
  documentId: string;
  clock: InteractionClock;
  newActionId: () => string;
}>;
type NameEditor = StoreApi<VersionedDraftState<DocumentDto, DocumentNameDraft>>;

/** Where one tab's draft lives. Example: `documentTabEditorKey(campaignId, documentId, tabId)`. */
export function documentTabEditorKey(
  campaignId: string,
  documentId: string,
  tabId: string,
): string {
  return `${campaignId}:${documentId}:${tabId}`;
}

/** One in-memory document: the name's draft plus one draft per opened tab, each with its own
 *  version, so a conflict in one tab never pauses another.
 *
 *  Example: `createDocumentEditorStore(options).getState().openTab(tabId)` */
export function createDocumentEditorStore(
  options: DocumentEditorOptions,
): StoreApi<DocumentEditorState> {
  const name = createVersionedDraftStore({ ...options, source: nameSourceOf(options) });
  const tabs = new Map<string, Readonly<{ tabId: string; unsubscribe: () => void }>>();
  let live = true;
  const store = createStore<DocumentEditorState>()((set, get) => ({
    confirmed: null,
    draft: null,
    status: 'loading',
    dirty: false,
    tabEditors: {},
    load: () => name.getState().load(),
    edit: (change) => name.getState().edit(change),
    flush: async () => {
      const editors = Object.values(get().tabEditors);
      await Promise.all([name.getState().flush(), ...editors.map((tab) => tab.getState().flush())]);
    },
    revalidate: () => name.getState().revalidate(),
    setLive: (next) => {
      live = next;
      name.getState().setLive(next);
      for (const tab of Object.values(get().tabEditors)) tab.getState().setLive(next);
    },
    discard: () => name.getState().discard(),
    dispose: () => {
      unsubscribeName();
      for (const key of [...tabs.keys()]) dropTab(key);
      name.getState().dispose();
      set({ confirmed: null, draft: null, status: 'not_found', dirty: false });
    },
    openTab: (tabId) => {
      if (!get().confirmed?.tabs.some((tab) => tab.id === tabId)) return null;
      const key = documentTabEditorKey(options.campaignId, options.documentId, tabId);
      for (const [other, tab] of Object.entries(get().tabEditors))
        if (other !== key && tab.getState().dirty) void tab.getState().flush();
      return get().tabEditors[key] ?? createTabEditor(tabId, key);
    },
    runTabCommand: async (command) => {
      await name.getState().flush();
      const document = get().confirmed;
      if (!document) return { ok: false, failure: { kind: 'not_found' } };
      const result = await sendTabCommand(options, document.version, command);
      if (result.ok) name.getState().adopt(result.value.document);
      else if (result.failure.kind === 'conflict') void name.getState().revalidate();
      return result;
    },
  }));
  const refreshDirty = (): void => {
    const editors = Object.values(store.getState().tabEditors);
    const dirty = name.getState().dirty || editors.some((tab) => tab.getState().dirty);
    if (dirty !== store.getState().dirty) store.setState({ dirty });
  };
  const dropTab = (key: string): void => {
    tabs.get(key)?.unsubscribe();
    tabs.delete(key);
    const { [key]: dropped, ...rest } = store.getState().tabEditors;
    dropped?.getState().dispose();
    store.setState({ tabEditors: rest });
    refreshDirty();
  };
  const createTabEditor = (tabId: string, key: string): StoreApi<DocumentTabEditorState> => {
    const editor = createVersionedDraftStore({
      ...options,
      source: tabSourceOf(options, tabId, name),
    });
    if (!live) editor.getState().setLive(false);
    const unsubscribe = editor.subscribe((state) => {
      if (state.status !== 'not_found') return refreshDirty();
      // A tab hidden or deleted meanwhile: drop its draft and learn the new tab list.
      dropTab(key);
      void name.getState().revalidate();
    });
    tabs.set(key, { tabId, unsubscribe });
    store.setState({ tabEditors: { ...store.getState().tabEditors, [key]: editor } });
    void editor.getState().load();
    return editor;
  };
  const reconcileTabs = (document: DocumentDto | null, previous: DocumentDto | null): void => {
    for (const [key, { tabId }] of [...tabs.entries()]) {
      const summary = document?.tabs.find((tab) => tab.id === tabId);
      const editor = store.getState().tabEditors[key];
      if (!summary || !editor) {
        dropTab(key);
        continue;
      }
      const tab = editor.getState().confirmed;
      const stale = tab !== null && tab.version !== summary.version;
      if (stale || document?.canEdit !== previous?.canEdit) void editor.getState().revalidate();
    }
  };
  const unsubscribeName = name.subscribe((state, previous) => {
    store.setState({ confirmed: state.confirmed, draft: state.draft, status: state.status });
    refreshDirty();
    if (state.confirmed !== previous.confirmed) reconcileTabs(state.confirmed, previous.confirmed);
  });
  return store;
}

function nameSourceOf(
  options: DocumentEditorOptions,
): VersionedDraftSource<DocumentDto, DocumentNameDraft> {
  const { api, campaignId, documentId } = options;
  return {
    read: () => api.detail(campaignId, documentId),
    save: async (draft, actionId, expectedVersion) => {
      const input = { actionId, expectedVersion, name: draft.name };
      const result = await api.save(campaignId, documentId, input);
      if (!result.ok) return result;
      const { document, receipt } = result.value;
      return { ok: true, value: { remote: document, receiptVersion: receipt.version } };
    },
    draftOf: (document) => ({ name: document.name }),
    versionOf: (document) => document.version,
    canEdit: (document) => document.canEdit,
  };
}

function tabSourceOf(
  options: DocumentEditorOptions,
  tabId: string,
  name: NameEditor,
): VersionedDraftSource<DocumentTabDto, DocumentTabDraft> {
  const { api, campaignId, documentId } = options;
  return {
    read: () => api.tab(campaignId, documentId, tabId),
    save: async (draft, actionId, expectedVersion) => {
      const input = { actionId, expectedVersion, content: draft.content };
      const result = await api.saveTab(campaignId, documentId, tabId, input);
      if (!result.ok) return result;
      const remote = { ...result.value.tab, schemaVersion: 1 as const, content: draft.content };
      return { ok: true, value: { remote, receiptVersion: result.value.receipt.version } };
    },
    draftOf: (tab) => ({ content: tab.content }),
    versionOf: (tab) => tab.version,
    // The tab carries no rights of its own: editing it is editing the document.
    canEdit: () => name.getState().confirmed?.canEdit ?? false,
  };
}

function sendTabCommand(
  options: DocumentEditorOptions,
  expectedVersion: number,
  command: DocumentTabCommand,
): Promise<DocumentsResult<DocumentWriteResponseDto>> {
  const { api, campaignId, documentId } = options;
  const base = { actionId: options.newActionId(), expectedVersion };
  if (command.kind === 'create')
    return api.createTab(campaignId, documentId, {
      ...base,
      ...(command.name === undefined ? {} : { name: command.name }),
    });
  if (command.kind === 'reorder')
    return api.reorderTabs(campaignId, documentId, { ...base, tabIds: [...command.tabIds] });
  if (command.kind === 'remove') return api.removeTab(campaignId, documentId, command.tabId, base);
  const change =
    command.kind === 'rename' ? { name: command.name } : { visibility: command.visibility };
  return api.updateTab(campaignId, documentId, command.tabId, { ...base, ...change });
}
