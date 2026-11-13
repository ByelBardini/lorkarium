import type {
  BlockRequestDto,
  FriendPresenceDto,
  FriendsOverviewDto,
  PresenceStatusDto,
  PresenceTableDto,
} from '@lorkarium/contracts';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { FriendsEvent } from '@/services/friends-events';
import type {
  FriendRequestOutcome,
  FriendsApi,
  FriendsFailure,
  FriendsResult,
} from '@/services/friends-api';

/** A friend's presence as the screen shows it: `table` only for an open public table. */
export type FriendPresence = Readonly<{
  status: PresenceStatusDto;
  table: PresenceTableDto | null;
}>;

export const OFFLINE_PRESENCE: FriendPresence = { status: 'offline', table: null };

export type FriendsState = Readonly<{
  /** `null` until the first read answers. */
  overview: FriendsOverviewDto | null;
  /** A read in flight (the first one or a re-read). */
  loading: boolean;
  /** Why the last read failed; the last good `overview` stays. Cleared by the next good read. */
  failure: FriendsFailure | null;
  /** By user id; a friend missing here is offline. */
  presence: Readonly<Record<string, FriendPresence>>;
}>;

export type FriendsStore = FriendsState &
  Readonly<{
    /** Reads `GET /friends`; while one is in flight, another call makes one more after it, never
     *  two at once. */
    load: () => Promise<void>;
    apply: (event: FriendsEvent) => void;
    sendRequest: (username: string) => Promise<FriendsResult<FriendRequestOutcome>>;
    acceptRequest: (userId: string) => Promise<FriendsResult<null>>;
    dropRequest: (userId: string) => Promise<FriendsResult<null>>;
    removeFriend: (userId: string) => Promise<FriendsResult<null>>;
    block: (target: BlockRequestDto) => Promise<FriendsResult<null>>;
    unblock: (userId: string) => Promise<FriendsResult<null>>;
    /** Sign-out: forgets everything; a read still in flight is dropped when it answers. */
    reset: () => void;
  }>;

const EMPTY: FriendsState = { overview: null, loading: false, failure: null, presence: {} };

type SetFriends = StoreApi<FriendsStore>['setState'];
type GetFriends = StoreApi<FriendsStore>['getState'];

/** The friends of the signed-in account, as the server confirmed them: the four lists from
 *  `GET /friends` and each friend's presence from the account socket. Every command answers its
 *  result and, when it succeeds, reads the lists again (the server is the authority).
 *
 *  Example: `const friends = createFriendsStore(friendsApi); await friends.getState().load()` */
export function createFriendsStore(api: FriendsApi): StoreApi<FriendsStore> {
  return createStore<FriendsStore>()((set, get) => {
    const loader = overviewLoader(api, set);
    const reloading = <T>(result: FriendsResult<T>): FriendsResult<null> => {
      if (!result.ok) return result;
      void get().load();
      return { ok: true, value: null };
    };
    return {
      ...EMPTY,
      load: loader.load,
      apply: (event) => applyEvent(event, get, set),
      sendRequest: async (username) => {
        const result = await api.sendRequest(username);
        reloading(result);
        return result;
      },
      acceptRequest: async (userId) => reloading(await api.acceptRequest(userId)),
      dropRequest: async (userId) => reloading(await api.dropRequest(userId)),
      removeFriend: async (userId) => reloading(await api.removeFriend(userId)),
      block: async (target) => reloading(await api.block(target)),
      unblock: async (userId) => reloading(await api.unblock(userId)),
      reset: () => {
        loader.forget();
        set(EMPTY);
      },
    };
  });
}

function overviewLoader(
  api: FriendsApi,
  set: SetFriends,
): Readonly<{ load: () => Promise<void>; forget: () => void }> {
  let inFlight: Promise<void> | null = null;
  let again = false;
  let generation = 0;
  const readOnce = async (): Promise<void> => {
    const started = generation;
    set({ loading: true });
    const result = await api.overview();
    if (started !== generation) return;
    if (result.ok) set({ overview: result.value, failure: null, loading: false });
    else set({ failure: result.failure, loading: false });
  };
  const run = async (): Promise<void> => {
    do {
      again = false;
      await readOnce();
    } while (again);
    inFlight = null;
  };
  return {
    load: () => {
      if (inFlight) {
        again = true;
        return inFlight;
      }
      inFlight = run();
      return inFlight;
    },
    forget: () => {
      generation += 1;
      again = false;
    },
  };
}

function applyEvent(event: FriendsEvent, get: GetFriends, set: SetFriends): void {
  if (event.kind === 'friendsChanged') return void get().load();
  if (event.kind === 'presenceSynced') return set({ presence: presenceMapOf(event.friends) });
  const { userId, status, table } = event.event;
  const overview = get().overview;
  if (!overview?.friends.some((friend) => friend.userId === userId)) return;
  set({ presence: { ...get().presence, [userId]: { status, table } } });
}

function presenceMapOf(friends: readonly FriendPresenceDto[]): Record<string, FriendPresence> {
  return Object.fromEntries(
    friends.map(({ userId, status, table }) => [userId, { status, table }]),
  );
}

/** The presence of one friend; offline when the server never said otherwise.
 *
 *  Example: `presenceOf(friends.getState(), bia.userId).status // 'online'` */
export function presenceOf(state: FriendsState, userId: string): FriendPresence {
  return state.presence[userId] ?? OFFLINE_PRESENCE;
}

/** How many received requests wait (half of the rail badge; the unread messages are the other).
 *
 *  Example: `selectIncomingCount(friends.getState()) // 2` */
export function selectIncomingCount(state: FriendsState): number {
  return state.overview?.incoming.length ?? 0;
}

/** React view of the friends store.
 *
 *  Example: `const overview = useFriends(friends, (state) => state.overview)` */
export function useFriends<T>(
  store: StoreApi<FriendsStore>,
  select: (state: FriendsStore) => T,
): T {
  return useStore(store, select);
}
