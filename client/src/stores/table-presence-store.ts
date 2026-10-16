import type {
  SessionMemberDto,
  SessionMemberJoinedDto,
  SessionMemberLeftDto,
} from '@lorkarium/contracts';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type {
  TableSessionFailure,
  TableSessionStatus,
  TableSessionUpdate,
} from '@/services/table-session-api';

/** Who is at one table, as the server confirmed it; `version: null` until the first snapshot. */
export type TablePresenceState = Readonly<{
  campaignId: string;
  status: TableSessionStatus | 'failed';
  failure: TableSessionFailure | null;
  version: number | null;
  members: readonly SessionMemberDto[];
}>;

export type TablePresenceStore = TablePresenceState &
  Readonly<{ apply: (update: TableSessionUpdate) => void }>;

/** A presence store for one visit to one table. A snapshot always replaces what is there (even
 *  of a lower version, after a server restart); an event applies only above the current version.
 *
 *  Example: `const store = createTablePresenceStore(campaignId); handle = api.open(campaignId, store.getState().apply)` */
export function createTablePresenceStore(campaignId: string): StoreApi<TablePresenceStore> {
  return createStore<TablePresenceStore>()((set) => ({
    campaignId,
    status: 'connecting',
    failure: null,
    version: null,
    members: [],
    apply: (update) => set((state) => applyUpdate(state, update)),
  }));
}

/** How many members are online right now.
 *
 *  Example: `useTablePresence(store, selectOnlineCount) // 2` */
export function selectOnlineCount(state: TablePresenceState): number {
  return state.members.filter((member) => member.online).length;
}

/** React view of a slice of the presence store (re-renders when the slice changes).
 *
 *  Example: `const members = useTablePresence(store, (state) => state.members)` */
export function useTablePresence<T>(
  store: StoreApi<TablePresenceStore>,
  selector: (state: TablePresenceStore) => T,
): T {
  return useStore(store, selector);
}

function applyUpdate(
  state: TablePresenceState,
  update: TableSessionUpdate,
): Partial<TablePresenceState> {
  if (update.kind === 'state')
    return { version: update.state.version, members: update.state.members };
  if (update.kind === 'status') return { status: update.status, failure: null };
  if (update.kind === 'failed') return { status: 'failed', failure: update.failure };
  // The board updates of the same visit belong to the board store.
  if (update.kind !== 'memberJoined' && update.kind !== 'memberLeft') return {};
  if (!isNewer(state, update.event)) return {};
  if (update.kind === 'memberJoined') return memberCameOnline(state, update.event);
  return memberWentOffline(state, update.event);
}

function isNewer(
  state: TablePresenceState,
  event: SessionMemberJoinedDto | SessionMemberLeftDto,
): boolean {
  if (state.version === null || event.campaignId !== state.campaignId) return false;
  return event.version > state.version;
}

function memberCameOnline(
  state: TablePresenceState,
  event: SessionMemberJoinedDto,
): Partial<TablePresenceState> {
  const listed = state.members.some((member) => member.userId === event.member.userId);
  const members = listed
    ? state.members.map((member) => (member.userId === event.member.userId ? event.member : member))
    : [...state.members, event.member];
  return { version: event.version, members };
}

function memberWentOffline(
  state: TablePresenceState,
  event: SessionMemberLeftDto,
): Partial<TablePresenceState> {
  const members = state.members.map((member) =>
    member.userId === event.userId ? { ...member, online: false } : member,
  );
  return { version: event.version, members };
}
