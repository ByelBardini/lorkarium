import type { BoardStateDto, TokensDraggedDto } from '@lorkarium/contracts';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { BoardEvent } from '@/services/board-events';
import type { BoardSyncFailure, TableSessionUpdate } from '@/services/table-session-api';
import { applyBoardEvent } from './board-reducer';

export type BoardStatus = 'loading' | 'ready' | 'failed';

/** The cell each token is being dragged over by someone else, by token id. */
export type DraggedCells = Readonly<Record<string, Readonly<{ col: number; row: number }>>>;

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
  /** Other people's drags: drawn over the confirmed cell until the move or the drag's end. */
  dragged: DraggedCells;
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
      dragged: {},
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
  if (update.kind === 'tokensDragged') return groupDraggedState(state, update.drag);
  if (update.kind !== 'boardEvent') return {};
  if (update.event.payload.campaignId !== state.campaignId) return {};
  const dragged = withoutDragOf(state.dragged, update.event);
  if (!state.board) return { held: [...state.held, update.event], dragged };
  return { ...eventState(state, state.board, update.event, resyncOnce), dragged };
}

function groupDraggedState(
  state: BoardStoreState,
  drag: TokensDraggedDto,
): Partial<BoardStoreState> {
  if (drag.campaignId !== state.campaignId) return {};
  const others = withoutTokens(
    state.dragged,
    drag.drags.map(({ tokenId }) => tokenId),
  );
  const over = drag.drags.flatMap(({ tokenId, cell }) => (cell ? [[tokenId, cell] as const] : []));
  return { dragged: { ...others, ...Object.fromEntries(over) } };
}

// The confirmed move (or the token's end) closes its drag, whatever its version did.
function withoutDragOf(dragged: DraggedCells, event: BoardEvent): DraggedCells {
  if (event.type === 'tokensMoved') {
    return withoutTokens(
      dragged,
      event.payload.moves.map(({ tokenId }) => tokenId),
    );
  }
  if (event.type !== 'tokenMoved' && event.type !== 'tokenDeleted') return dragged;
  if (!(event.payload.tokenId in dragged)) return dragged;
  return withoutToken(dragged, event.payload.tokenId);
}

function withoutToken(dragged: DraggedCells, tokenId: string): DraggedCells {
  return withoutTokens(dragged, [tokenId]);
}

function withoutTokens(dragged: DraggedCells, tokenIds: readonly string[]): DraggedCells {
  return Object.fromEntries(Object.entries(dragged).filter(([id]) => !tokenIds.includes(id)));
}

function snapshotState(
  state: BoardStoreState,
  snapshot: BoardStateDto,
  resyncOnce: () => Partial<BoardStoreState>,
): Partial<BoardStoreState> {
  const fresh = { ...state, board: snapshot, held: [], resyncAsked: false, dragged: {} };
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
