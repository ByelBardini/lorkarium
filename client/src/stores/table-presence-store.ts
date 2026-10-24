import type {
  SessionCampaignUpdatedDto,
  SessionMemberActivityDto,
  SessionMemberDto,
  SessionMemberJoinedDto,
  SessionMemberLeftDto,
  SessionMemberUpdatedDto,
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
  /** The server time of the last snapshot or event applied (what "há N min" counts from). */
  at: string | null;
}>;

export type TablePresenceStore = TablePresenceState &
  Readonly<{ apply: (update: TableSessionUpdate) => void }>;

/** A presence store for one visit to one table. A snapshot always replaces what is there (even
 *  of a lower version, after a server restart); an event applies only above the current version.
 *  `campaignUpdated` only moves the version (the campaign itself lives in the open tables store).
 *
 *  Example: `const store = createTablePresenceStore(campaignId); handle = api.open(campaignId, store.getState().apply)` */
export function createTablePresenceStore(campaignId: string): StoreApi<TablePresenceStore> {
  return createStore<TablePresenceStore>()((set) => ({
    campaignId,
    status: 'connecting',
    failure: null,
    version: null,
    members: [],
    at: null,
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
  if (update.kind === 'state') {
    const { version, members, at } = update.state;
    return { version, members, at };
  }
  if (update.kind === 'status') return { status: update.status, failure: null };
  if (update.kind === 'failed') return { status: 'failed', failure: update.failure };
  // The campaign itself changed: nobody came or went, but the roster version moved with it.
  if (update.kind === 'campaignUpdated') return campaignVersionOf(state, update.event);
  // The board updates of the same visit belong to the board store.
  if (!isPresenceEvent(update)) return {};
  if (!isNewer(state, update.event)) return {};
  return { ...presenceChangeOf(state, update), at: update.event.at };
}

function presenceChangeOf(
  state: TablePresenceState,
  update: PresenceEvent,
): Partial<TablePresenceState> {
  if (update.kind === 'memberJoined') return memberCameOnline(state, update.event);
  if (update.kind === 'memberActivity') return memberActivityOf(state, update.event);
  if (update.kind === 'memberUpdated') return memberProfileOf(state, update.event);
  return memberWentOffline(state, update.event);
}

type PresenceEvent = Extract<
  TableSessionUpdate,
  Readonly<{ kind: 'memberJoined' | 'memberLeft' | 'memberActivity' | 'memberUpdated' }>
>;

function isPresenceEvent(update: TableSessionUpdate): update is PresenceEvent {
  return (
    update.kind === 'memberJoined' ||
    update.kind === 'memberLeft' ||
    update.kind === 'memberActivity' ||
    update.kind === 'memberUpdated'
  );
}

function campaignVersionOf(
  state: TablePresenceState,
  event: SessionCampaignUpdatedDto,
): Partial<TablePresenceState> {
  if (!isNewer(state, event)) return {};
  return { version: event.version, at: event.at };
}

type VersionedEvent = Readonly<{ campaignId: string; version: number }>;

function isNewer(state: TablePresenceState, event: VersionedEvent): boolean {
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
    member.userId === event.userId ? { ...member, online: false, awaySince: null } : member,
  );
  return { version: event.version, members };
}

function memberActivityOf(
  state: TablePresenceState,
  event: SessionMemberActivityDto,
): Partial<TablePresenceState> {
  const { userId, awaySince } = event;
  const members = state.members.map((member) =>
    member.userId === userId ? { ...member, awaySince } : member,
  );
  return { version: event.version, members };
}

// The profile changed, not the presence: whether the member is online or away stays as it was.
function memberProfileOf(
  state: TablePresenceState,
  event: SessionMemberUpdatedDto,
): Partial<TablePresenceState> {
  const { member: updated } = event;
  const members = state.members.map((member) =>
    member.userId === updated.userId
      ? { ...updated, online: member.online, awaySince: member.awaySince }
      : member,
  );
  return { version: event.version, members };
}
