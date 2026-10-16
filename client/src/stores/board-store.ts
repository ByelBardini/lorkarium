import type { BoardStateDto } from '@lorkarium/contracts';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { BoardEvent } from '@/services/board-events';
import type { BoardSyncFailure, TableSessionUpdate } from '@/services/table-session-api';
import { applyBoardEvent } from './board-reducer';

export type BoardStatus = 'loading' | 'ready' | 'failed';

/** The confirmed board of one open table. `held` are events that cannot apply yet: before the
 *  first snapshot, or after a version gap while the resync is on its way. */
export type BoardStoreState = Readonly<{
  campaignId: string;
  status: BoardStatus;
  failure: BoardSyncFailure | null;
  board: BoardStateDto | null;
  held: readonly BoardEvent[];
  resyncAsked: boolean;
  /** How many snapshots arrived: each one replaces the board, so local previews are void. */
  snapshots: number;
}>;

export type BoardStore = BoardStoreState &
  Readonly<{
    apply: (update: TableSessionUpdate) => void;
    retry: () => void;
  }>;

/** A board store for one open table. A snapshot always replaces the board; an event applies only
 *  at `version + 1`, is a duplicate at or below it, and a gap asks `requestResync` once.
 *
 *  Example: `const board = createBoardStore(campaignId, () => handle.resync())` */
export function createBoardStore(
  campaignId: string,
  requestResync: () => void,
): StoreApi<BoardStore> {
  return createStore<BoardStore>()((set, get) => {
    const resyncOnce = (): Partial<BoardStoreState> => {
      if (!get().resyncAsked) requestResync();
      return { resyncAsked: true };
    };
    return {
      campaignId,
      status: 'loading',
      failure: null,
      board: null,
      held: [],
      resyncAsked: false,
      snapshots: 0,
      apply: (update) => set(nextState(get(), update, resyncOnce)),
      retry: () => {
        set({ status: 'loading', failure: null });
        requestResync();
      },
    };
  });
}

/** React view of a slice of the board store (re-renders when the slice changes).
 *
 *  Example: `const scene = useBoard(store, (state) => state.board?.scene)` */
export function useBoard<T>(store: StoreApi<BoardStore>, selector: (state: BoardStore) => T): T {
  return useStore(store, selector);
}

function nextState(
  state: BoardStoreState,
  update: TableSessionUpdate,
  resyncOnce: () => Partial<BoardStoreState>,
): Partial<BoardStoreState> {
  if (update.kind === 'board') return snapshotState(state, update.state, resyncOnce);
  if (update.kind === 'boardFailed') return failedState(state, update.failure);
  if (update.kind !== 'boardEvent') return {};
  if (update.event.payload.campaignId !== state.campaignId) return {};
  if (!state.board) return { held: [...state.held, update.event] };
  return eventState(state, state.board, update.event, resyncOnce);
}

function snapshotState(
  state: BoardStoreState,
  snapshot: BoardStateDto,
  resyncOnce: () => Partial<BoardStoreState>,
): Partial<BoardStoreState> {
  const fresh = { ...state, board: snapshot, held: [], resyncAsked: false };
  const replayed = state.held.reduce<BoardStoreState>((current, event) => {
    if (!current.board) return current;
    return { ...current, ...eventState(current, current.board, event, resyncOnce) };
  }, fresh);
  return { ...replayed, status: 'ready', failure: null, snapshots: state.snapshots + 1 };
}

function eventState(
  state: BoardStoreState,
  board: BoardStateDto,
  event: BoardEvent,
  resyncOnce: () => Partial<BoardStoreState>,
): Partial<BoardStoreState> {
  if (event.payload.version <= board.version) return {};
  if (event.payload.version > board.version + 1) {
    return { ...resyncOnce(), held: [...state.held, event] };
  }
  return { board: applyBoardEvent(board, event) };
}

// A failed resync keeps the board already shown; only a board that never loaded fails.
function failedState(state: BoardStoreState, failure: BoardSyncFailure): Partial<BoardStoreState> {
  if (state.board) return { resyncAsked: false };
  return { status: 'failed', failure };
}
