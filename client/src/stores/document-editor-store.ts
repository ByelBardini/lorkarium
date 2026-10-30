import type { DocumentContentDto, DocumentDto } from '@lorkarium/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { DocumentsApi } from '@/services/documents-api';

export type DocumentDraft = Readonly<{ name: string; content: DocumentContentDto }>;
export type DocumentSaveStatus =
  | 'loading'
  | 'saved'
  | 'pending'
  | 'saving'
  | 'offline'
  | 'conflict'
  | 'forbidden'
  | 'not_found'
  | 'failure';
export type DocumentEditorState = Readonly<{
  confirmed: DocumentDto | null;
  draft: DocumentDraft | null;
  status: DocumentSaveStatus;
  dirty: boolean;
  load: () => Promise<void>;
  edit: (change: Partial<DocumentDraft>) => void;
  flush: () => Promise<void>;
  revalidate: () => Promise<void>;
  setLive: (live: boolean) => void;
  discard: () => Promise<void>;
  dispose: () => void;
}>;
export type DocumentEditorOptions = Readonly<{
  api: DocumentsApi;
  campaignId: string;
  documentId: string;
  clock: InteractionClock;
  newActionId: () => string;
}>;

/** One in-memory draft per mounted document. Example: `createDocumentEditorStore(options)`. */
export function createDocumentEditorStore(
  options: DocumentEditorOptions,
): StoreApi<DocumentEditorState> {
  const { api, campaignId, documentId, clock, newActionId } = options;
  let cancelled = false,
    live = true,
    readGeneration = 0;
  let rereadAfterSave = false;
  let reauthorized = true;
  let cancelTimer: (() => void) | undefined;
  let saving: Promise<void> | null = null;
  let readingPromise: Promise<void> | null = null;
  let readAgain = false;
  let uncertain: { draft: DocumentDraft; actionId: string; version: number } | null = null;
  const store = createStore<DocumentEditorState>()((set, get) => {
    const stop = (): void => {
      cancelTimer?.();
      cancelTimer = undefined;
    };
    const schedule = (): void => {
      stop();
      cancelTimer = clock.after(1000, () => {
        void get().flush();
      });
    };
    const clear = (status: DocumentSaveStatus): void => {
      stop();
      uncertain = null;
      set({ confirmed: null, draft: null, dirty: false, status });
    };
    const performRead = async (reconciling = false): Promise<void> => {
      const reading = ++readGeneration;
      const result = await api.detail(campaignId, documentId);
      if (cancelled || reading !== readGeneration) return;
      if (!result.ok) {
        if (result.failure.kind === 'not_found' || result.failure.kind === 'unauthenticated')
          return clear('not_found');
        stop();
        set({ status: result.failure.kind === 'offline' ? 'offline' : 'failure' });
        return;
      }
      const remote = result.value;
      reauthorized = live;
      if (saving && !reconciling) {
        rereadAfterSave = true;
        return;
      }
      const { dirty, draft, confirmed } = get();
      if (!dirty) {
        set({ confirmed: remote, draft: draftOf(remote), status: 'saved' });
        return;
      }
      if (!remote.canEdit) {
        stop();
        set({ confirmed: remote, status: 'forbidden' });
        return;
      }
      if (get().status === 'conflict') {
        set({ confirmed: remote });
        return;
      }
      if (uncertain && sameDraft(draftOf(remote), uncertain.draft)) {
        uncertain = null;
        const stillDirty = !sameDraft(draft, draftOf(remote));
        set({ confirmed: remote, dirty: stillDirty, status: stillDirty ? 'pending' : 'saved' });
        if (stillDirty && live) schedule();
        return;
      }
      if (remote.version !== confirmed?.version) {
        stop();
        set({ confirmed: remote, status: 'conflict' });
        return;
      }
      set({ confirmed: remote, status: live ? 'pending' : 'offline' });
      if (live) schedule();
    };
    const read = (reconciling = false): Promise<void> => {
      if (readingPromise) {
        readAgain = true;
        readGeneration++;
        return readingPromise;
      }
      const cycle = async (): Promise<void> => {
        do {
          readAgain = false;
          await performRead(reconciling);
        } while (readAgain && !cancelled);
      };
      readingPromise = cycle().finally(() => {
        readingPromise = null;
      });
      return readingPromise;
    };
    const send = async (): Promise<void> => {
      const { draft, confirmed, dirty, status } = get();
      if (
        !live ||
        !reauthorized ||
        cancelled ||
        !draft ||
        !confirmed?.canEdit ||
        !dirty ||
        ['conflict', 'forbidden', 'not_found'].includes(status)
      )
        return;
      readGeneration++;
      const attempt = uncertain ?? { draft, actionId: newActionId(), version: confirmed.version };
      uncertain = attempt;
      stop();
      set({ status: 'saving' });
      const result = await api.save(campaignId, documentId, {
        ...attempt.draft,
        actionId: attempt.actionId,
        expectedVersion: attempt.version,
      });
      if (cancelled || !get().confirmed) return;
      if (!result.ok) {
        const kind = result.failure.kind;
        if (kind === 'not_found' || kind === 'unauthenticated') return clear('not_found');
        if (kind !== 'offline') uncertain = null;
        set({
          status:
            kind === 'conflict' || kind === 'action_reused'
              ? 'conflict'
              : kind === 'forbidden'
                ? 'forbidden'
                : kind === 'offline'
                  ? 'offline'
                  : 'failure',
        });
        return;
      }
      uncertain = null;
      const current = result.value.document;
      if (current.version !== result.value.receipt.version) {
        set({ confirmed: current, status: 'conflict' });
        return;
      }
      const dirtyNow = !sameDraft(get().draft, attempt.draft);
      set({
        confirmed: current,
        draft: dirtyNow ? get().draft : draftOf(current),
        dirty: dirtyNow,
        status: dirtyNow ? 'pending' : 'saved',
      });
      if (dirtyNow && live) schedule();
    };
    return {
      confirmed: null,
      draft: null,
      status: 'loading',
      dirty: false,
      load: read,
      revalidate: read,
      edit: (change) => {
        const { draft, confirmed, status } = get();
        if (!draft || !confirmed?.canEdit || cancelled) return;
        set({
          draft: { ...draft, ...change },
          dirty: true,
          status: ['conflict', 'forbidden'].includes(status)
            ? status
            : live
              ? 'pending'
              : 'offline',
        });
        if (!['conflict', 'forbidden'].includes(status) && live) schedule();
      },
      flush: () => {
        if (saving) return saving;
        const reconcile = async (): Promise<void> => {
          await read(true);
          if (!['saved', 'pending'].includes(get().status)) return;
          await send();
        };
        saving = (uncertain ? reconcile() : send()).finally(() => {
          saving = null;
          if (rereadAfterSave) {
            rereadAfterSave = false;
            void read();
          }
        });
        return saving;
      },
      setLive: (next) => {
        if (live === next) return;
        live = next;
        reauthorized = false;
        stop();
        if (!next) {
          if (get().dirty) set({ status: 'offline' });
          return;
        }
        void read();
      },
      discard: async () => {
        stop();
        uncertain = null;
        set({ dirty: false });
        await read();
      },
      dispose: () => {
        cancelled = true;
        readGeneration++;
        clear('not_found');
      },
    };
  });
  return store;
}

function draftOf(document: DocumentDto): DocumentDraft {
  return { name: document.name, content: document.content };
}
function sameDraft(left: DocumentDraft | null, right: DocumentDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
