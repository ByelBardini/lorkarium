import { createStore, type StoreApi } from 'zustand/vanilla';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { DocumentsResult } from '@/services/documents-api';

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
export type VersionedDraftState<Remote, Draft extends object> = Readonly<{
  confirmed: Remote | null;
  draft: Draft | null;
  status: DocumentSaveStatus;
  dirty: boolean;
  load: () => Promise<void>;
  edit: (change: Partial<Draft>) => void;
  flush: () => Promise<void>;
  revalidate: () => Promise<void>;
  setLive: (live: boolean) => void;
  /** Takes a newer confirmed copy written by another command of this client (e.g. a tab
   *  rename bumped the document version): the next save goes against it. */
  adopt: (remote: Remote) => void;
  discard: () => Promise<void>;
  dispose: () => void;
}>;
/** A saved write: the confirmed copy now on the server and the version its receipt names. */
export type VersionedWrite<Remote> = Readonly<{ remote: Remote; receiptVersion: number }>;
/** How one versioned resource is read, saved and compared. */
export type VersionedDraftSource<Remote, Draft extends object> = Readonly<{
  read: () => Promise<DocumentsResult<Remote>>;
  save: (
    draft: Draft,
    actionId: string,
    expectedVersion: number,
  ) => Promise<DocumentsResult<VersionedWrite<Remote>>>;
  draftOf: (remote: Remote) => Draft;
  versionOf: (remote: Remote) => number;
  canEdit: (remote: Remote) => boolean;
}>;
export type VersionedDraftOptions<Remote, Draft extends object> = Readonly<{
  source: VersionedDraftSource<Remote, Draft>;
  clock: InteractionClock;
  newActionId: () => string;
}>;
const BLOCKED: readonly DocumentSaveStatus[] = ['conflict', 'forbidden', 'not_found'];

/** An in-memory draft of one versioned resource: 1000 ms debounce, one save in flight, the
 *  `actionId` kept while the outcome is uncertain, and a conflict that stays until discarded.
 *
 *  Example: `createVersionedDraftStore({ source, clock, newActionId })` */
export function createVersionedDraftStore<Remote, Draft extends object>(
  options: VersionedDraftOptions<Remote, Draft>,
): StoreApi<VersionedDraftState<Remote, Draft>> {
  const { source, clock, newActionId } = options;
  let cancelled = false,
    live = true,
    readGeneration = 0;
  let rereadAfterSave = false;
  let reauthorized = true;
  let cancelTimer: (() => void) | undefined;
  let saving: Promise<void> | null = null;
  let readingPromise: Promise<void> | null = null;
  let readAgain = false;
  let uncertain: { draft: Draft; actionId: string; version: number } | null = null;
  type State = VersionedDraftState<Remote, Draft>;
  return createStore<State>()((set, get) => {
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
    const reconcileDirty = (remote: Remote): void => {
      const { draft, confirmed } = get();
      if (!source.canEdit(remote)) {
        stop();
        set({ confirmed: remote, status: 'forbidden' });
        return;
      }
      if (get().status === 'conflict') return set({ confirmed: remote });
      if (uncertain && sameDraft(source.draftOf(remote), uncertain.draft)) {
        uncertain = null;
        const stillDirty = !sameDraft(draft, source.draftOf(remote));
        set({ confirmed: remote, dirty: stillDirty, status: stillDirty ? 'pending' : 'saved' });
        if (stillDirty && live) schedule();
        return;
      }
      if (confirmed === null || source.versionOf(remote) !== source.versionOf(confirmed)) {
        stop();
        set({ confirmed: remote, status: 'conflict' });
        return;
      }
      set({ confirmed: remote, status: live ? 'pending' : 'offline' });
      if (live) schedule();
    };
    const performRead = async (reconciling = false): Promise<void> => {
      const reading = ++readGeneration;
      const result = await source.read();
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
      if (get().dirty) return reconcileDirty(remote);
      set({ confirmed: remote, draft: source.draftOf(remote), status: 'saved' });
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
    const canSend = (): boolean => {
      const { draft, confirmed, dirty, status } = get();
      if (!live || !reauthorized || cancelled || !draft || !dirty) return false;
      return confirmed !== null && source.canEdit(confirmed) && !BLOCKED.includes(status);
    };
    const refusedStatus = (kind: string): DocumentSaveStatus => {
      if (kind === 'conflict' || kind === 'action_reused') return 'conflict';
      if (kind === 'forbidden') return 'forbidden';
      return kind === 'offline' ? 'offline' : 'failure';
    };
    const send = async (): Promise<void> => {
      const { draft, confirmed } = get();
      if (!canSend() || !draft || !confirmed) return;
      readGeneration++;
      const version = source.versionOf(confirmed);
      const attempt = uncertain ?? { draft, actionId: newActionId(), version };
      uncertain = attempt;
      stop();
      set({ status: 'saving' });
      const result = await source.save(attempt.draft, attempt.actionId, attempt.version);
      if (cancelled || !get().confirmed) return;
      if (!result.ok) {
        const kind = result.failure.kind;
        if (kind === 'not_found' || kind === 'unauthenticated') return clear('not_found');
        if (kind !== 'offline') uncertain = null;
        set({ status: refusedStatus(kind) });
        return;
      }
      uncertain = null;
      const { remote, receiptVersion } = result.value;
      if (source.versionOf(remote) !== receiptVersion) {
        set({ confirmed: remote, status: 'conflict' });
        return;
      }
      const dirtyNow = !sameDraft(get().draft, attempt.draft);
      set({
        confirmed: remote,
        draft: dirtyNow ? get().draft : source.draftOf(remote),
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
        if (!draft || !confirmed || !source.canEdit(confirmed) || cancelled) return;
        const held = status === 'conflict' || status === 'forbidden';
        set({
          draft: { ...draft, ...change },
          dirty: true,
          status: held ? status : live ? 'pending' : 'offline',
        });
        if (!held && live) schedule();
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
      adopt: (remote) => {
        if (cancelled || !get().confirmed) return;
        if (get().dirty) return set({ confirmed: remote });
        set({ confirmed: remote, draft: source.draftOf(remote), status: 'saved' });
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
}

function sameDraft<Draft>(left: Draft | null, right: Draft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
