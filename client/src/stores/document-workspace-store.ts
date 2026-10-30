import type { CampaignDetailDto, DocumentSummaryDto } from '@lorkarium/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { useCallback, useSyncExternalStore } from 'react';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { DocumentsApi } from '@/services/documents-api';
import type { ChatWindowHandle, ChatWindowHost } from '@/services/chat-window-host';
import { DOCUMENT_WINDOW_FEATURES, DOCUMENT_WINDOW_URL } from '@/services/chat-window-host';
import { createDocumentEditorStore, type DocumentEditorState } from './document-editor-store';

export type DocumentWorkspaceEntry = Readonly<{
  key: string;
  campaign: CampaignDetailDto;
  document: DocumentSummaryDto;
  editor: StoreApi<DocumentEditorState>;
  target: HTMLElement | null;
  focusName: boolean;
  windowHandle: ChatWindowHandle | null;
  windowBlocked: boolean;
  closeProblem: string | null;
}>;
type OpenDocument = Readonly<{
  campaign: CampaignDetailDto;
  document: DocumentSummaryDto;
  focusName?: boolean;
}>;
type LeaveGuard = () => Promise<boolean>;
export type DocumentWorkspaceStore = Readonly<{
  entries: readonly DocumentWorkspaceEntry[];
  activeByCampaign: Readonly<Record<string, string | null>>;
  activate: (campaignId: string, key: string | null) => void;
  open: (input: OpenDocument) => string;
  close: (key: string) => Promise<boolean>;
  setTarget: (key: string, target: HTMLElement | null) => void;
  setLeaveGuard: (key: string, guard: LeaveGuard | null) => void;
  openWindow: (key: string, host: ChatWindowHost) => void;
  clear: () => void;
  removeCampaign: (campaignId: string) => void;
}>;
export type DocumentWorkspaceOptions = Readonly<{
  api: DocumentsApi;
  clock: InteractionClock;
  newActionId?: () => string;
}>;
export function documentWorkspaceKey(campaignId: string, documentId: string): string {
  return `${campaignId}:${documentId}`;
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
  const guards = new Map<string, LeaveGuard>();
  const subscriptions = new Map<string, () => void>();
  return createStore<DocumentWorkspaceStore>()((set, get) => {
    const patch = (key: string, changes: Partial<DocumentWorkspaceEntry>): void =>
      set((state) => ({
        entries: state.entries.map((entry) =>
          entry.key === key ? { ...entry, ...changes } : entry,
        ),
      }));
    const remove = (key: string): void => {
      const entry = get().entries.find((candidate) => candidate.key === key);
      subscriptions.get(key)?.();
      subscriptions.delete(key);
      guards.delete(key);
      entry?.editor.getState().dispose();
      const closing =
        entry?.windowHandle && !entry.windowHandle.closed ? entry.windowHandle.close() : undefined;
      if (closing) void closing.catch(() => undefined);
      set((state) => ({
        entries: state.entries.filter((candidate) => candidate.key !== key),
        activeByCampaign: Object.fromEntries(
          Object.entries(state.activeByCampaign).map(([campaignId, active]) => [
            campaignId,
            active === key ? null : active,
          ]),
        ),
      }));
    };
    return {
      entries: [],
      activeByCampaign: {},
      activate: (campaignId, key) => {
        if (
          key &&
          !get().entries.some((entry) => entry.key === key && entry.campaign.id === campaignId)
        )
          return;
        set((state) => ({ activeByCampaign: { ...state.activeByCampaign, [campaignId]: key } }));
      },
      open: (input) => {
        const key = documentWorkspaceKey(input.campaign.id, input.document.id);
        const existing = get().entries.find((entry) => entry.key === key);
        if (existing) {
          patch(key, { campaign: input.campaign, ...(input.focusName ? { focusName: true } : {}) });
          get().activate(input.campaign.id, key);
          return key;
        }
        const editor = createDocumentEditorStore({
          ...options,
          campaignId: input.campaign.id,
          documentId: input.document.id,
          newActionId: options.newActionId ?? (() => crypto.randomUUID()),
        });
        const entry: DocumentWorkspaceEntry = {
          ...input,
          key,
          editor,
          target: null,
          focusName: input.focusName ?? false,
          windowHandle: null,
          windowBlocked: false,
          closeProblem: null,
        };
        set((state) => ({
          entries: [...state.entries, entry],
          activeByCampaign: { ...state.activeByCampaign, [input.campaign.id]: key },
        }));
        subscriptions.set(
          key,
          editor.subscribe((state, previous) => {
            if (state.status === 'not_found') return remove(key);
            if (state.confirmed && state.confirmed !== previous.confirmed)
              patch(key, { document: state.confirmed });
          }),
        );
        void editor.getState().load();
        return key;
      },
      close: async (key) => {
        const entry = get().entries.find((candidate) => candidate.key === key);
        if (!entry) return true;
        await entry.editor.getState().flush();
        if (entry.editor.getState().dirty && !(await guards.get(key)?.())) return false;
        try {
          if (entry.windowHandle && !entry.windowHandle.closed) await entry.windowHandle.close();
        } catch {
          patch(key, { closeProblem: 'Não foi possível fechar a janela. Tente novamente.' });
          return false;
        }
        remove(key);
        return true;
      },
      setTarget: (key, target) => patch(key, { target }),
      setLeaveGuard: (key, guard) => {
        if (guard) guards.set(key, guard);
        else guards.delete(key);
      },
      openWindow: (key, host) => {
        const entry = get().entries.find((candidate) => candidate.key === key);
        if (!entry) return;
        if (entry.windowHandle && !entry.windowHandle.closed) return entry.windowHandle.focus();
        const windowHandle = host.open(
          DOCUMENT_WINDOW_URL,
          `lorkarium-document-${key}`,
          DOCUMENT_WINDOW_FEATURES,
        );
        patch(key, { windowHandle, windowBlocked: !windowHandle });
      },
      clear: () => {
        for (const entry of get().entries) remove(entry.key);
        set({ activeByCampaign: {} });
      },
      removeCampaign: (campaignId) => {
        for (const entry of get().entries) if (entry.campaign.id === campaignId) remove(entry.key);
      },
    };
  });
}
