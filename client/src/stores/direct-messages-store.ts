import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  TYPING_SHOWN_MS,
  emptyDirectConversation,
  friendIdOf,
  withDirectMessage,
  type DirectConversation,
} from '@/lib/direct-conversations';
import type { InteractionClock } from '@/lib/interaction-clock';
import type {
  DirectMessageCommands,
  DirectMessageFailure,
} from '@/services/direct-message-commands';
import type { DirectMessageEvent } from '@/services/direct-message-events';
import {
  readDirectConversations,
  removeAllDirectConversations,
  removeDirectConversation,
  writeDirectConversation,
} from './direct-messages-storage';
import type { TabStorage } from './scene-tabs-storage';

// One `dm:typing` per friend at most this often while the person keeps typing.
const TYPING_SEND_INTERVAL_MS = 2000;

/** A refused send gives the text back, for the field to keep it. */
export type DirectSendOutcome =
  Readonly<{ ok: true }> | Readonly<{ ok: false; failure: DirectMessageFailure; text: string }>;

export type DirectMessagesState = Readonly<{
  /** The signed-in account; `null` signed out (nothing is kept then). */
  accountId: string | null;
  conversations: Readonly<Record<string, DirectConversation>>;
  /** The conversation on screen (its messages are read at once), or `null`. */
  activeFriendId: string | null;
  /** The friends shown as "digitando…" right now. */
  typing: Readonly<Record<string, true>>;
}>;

export type DirectMessagesStore = DirectMessagesState &
  Readonly<{
    /** Signed in: reads that account's conversations from this device. */
    signIn: (accountId: string) => void;
    /** Signed out: deletes every conversation of the account from this device. */
    signOut: () => void;
    apply: (event: DirectMessageEvent) => void;
    /** The conversation now on screen (unread goes to zero), or `null` when none is. */
    setActive: (friendId: string | null) => void;
    send: (friendId: string, text: string) => Promise<DirectSendOutcome>;
    /** The person is typing to `friendId`: tells them, at most every 2 s. */
    notifyTyping: (friendId: string) => void;
    /** A friend blocked: their conversation goes from this device (removing keeps it). */
    forget: (friendId: string) => void;
  }>;

export type DirectMessagesDeps = Readonly<{
  commands: DirectMessageCommands;
  storage: TabStorage;
  clock: InteractionClock;
}>;

type SetDm = StoreApi<DirectMessagesStore>['setState'];
type GetDm = StoreApi<DirectMessagesStore>['getState'];

const SIGNED_OUT: DirectMessagesState = {
  accountId: null,
  conversations: {},
  activeFriendId: null,
  typing: {},
};

/** The direct messages of the signed-in account: nothing is saved by the server, so the history
 *  lives in `localStorage`, per account and per friend (the last `DIRECT_HISTORY_LIMIT`); a
 *  storage that throws keeps it in memory. Unread counts only what arrived here.
 *
 *  Example: `createDirectMessagesStore({ commands, storage: localStorage, clock: browserClock })` */
export function createDirectMessagesStore(deps: DirectMessagesDeps): StoreApi<DirectMessagesStore> {
  return createStore<DirectMessagesStore>()((set, get) => {
    const typing = typingIndicator(deps.clock, set, get);
    const lastTypingSent = new Map<string, number>();
    return {
      ...SIGNED_OUT,
      signIn: (accountId) => {
        typing.clearAll();
        set({
          ...SIGNED_OUT,
          accountId,
          conversations: readDirectConversations(deps.storage, accountId),
        });
      },
      signOut: () => {
        const { accountId, conversations } = get();
        if (accountId)
          removeAllDirectConversations(deps.storage, accountId, Object.keys(conversations));
        typing.clearAll();
        set(SIGNED_OUT);
      },
      apply: (event) => {
        if (event.kind === 'typingFrom') return typing.show(event.event.fromUserId);
        receive(event.event, deps.storage, set, get);
        const friendId = friendIdOf(event.event, get().accountId ?? '');
        if (friendId === event.event.fromUserId) typing.hide(friendId);
      },
      setActive: (friendId) => {
        set({ activeFriendId: friendId });
        if (friendId) markRead(friendId, deps.storage, set, get);
      },
      send: async (friendId, text) => {
        const result = await deps.commands.send(friendId, text);
        return result.ok ? { ok: true } : { ok: false, failure: result.failure, text };
      },
      notifyTyping: (friendId) => {
        const now = deps.clock.now();
        const last = lastTypingSent.get(friendId);
        if (last !== undefined && now - last < TYPING_SEND_INTERVAL_MS) return;
        lastTypingSent.set(friendId, now);
        deps.commands.typing(friendId);
      },
      forget: (friendId) => forget(friendId, deps.storage, set, get),
    };
  });
}

function receive(
  event: Parameters<typeof friendIdOf>[0],
  storage: TabStorage,
  set: SetDm,
  get: GetDm,
): void {
  const { accountId, conversations, activeFriendId } = get();
  const friendId = accountId ? friendIdOf(event, accountId) : null;
  if (!accountId || !friendId) return;
  const current = conversations[friendId] ?? emptyDirectConversation(friendId);
  const next = withDirectMessage(current, event, { open: activeFriendId === friendId });
  if (next === current) return;
  saveConversation(next, storage, set, get);
}

function markRead(friendId: string, storage: TabStorage, set: SetDm, get: GetDm): void {
  const current = get().conversations[friendId];
  if (!current || current.unread === 0) return;
  saveConversation({ ...current, unread: 0 }, storage, set, get);
}

function saveConversation(
  conversation: DirectConversation,
  storage: TabStorage,
  set: SetDm,
  get: GetDm,
): void {
  const { accountId } = get();
  const conversations = { ...get().conversations, [conversation.friendId]: conversation };
  set({ conversations });
  if (accountId)
    writeDirectConversation(storage, accountId, conversation, Object.keys(conversations));
}

function forget(friendId: string, storage: TabStorage, set: SetDm, get: GetDm): void {
  const { accountId, conversations, activeFriendId } = get();
  const remaining = withoutKey(conversations, friendId);
  set({
    conversations: remaining,
    activeFriendId: activeFriendId === friendId ? null : activeFriendId,
  });
  if (accountId) removeDirectConversation(storage, accountId, friendId, Object.keys(remaining));
}

function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([entry]) => entry !== key));
}

type TypingIndicator = Readonly<{
  show: (friendId: string) => void;
  hide: (friendId: string) => void;
  clearAll: () => void;
}>;

function typingIndicator(clock: InteractionClock, set: SetDm, get: GetDm): TypingIndicator {
  const timers = new Map<string, () => void>();
  const hide = (friendId: string): void => {
    timers.get(friendId)?.();
    timers.delete(friendId);
    if (!get().typing[friendId]) return;
    set({ typing: withoutKey(get().typing, friendId) });
  };
  return {
    show: (friendId) => {
      timers.get(friendId)?.();
      timers.set(
        friendId,
        clock.after(TYPING_SHOWN_MS, () => hide(friendId)),
      );
      if (!get().typing[friendId]) set({ typing: { ...get().typing, [friendId]: true } });
    },
    hide,
    clearAll: () => {
      for (const cancel of timers.values()) cancel();
      timers.clear();
    },
  };
}

/** Every unread direct message (half of the rail badge; the received requests are the other).
 *
 *  Example: `selectDirectUnreadCount(dms.getState()) // 3` */
export function selectDirectUnreadCount(state: DirectMessagesState): number {
  return Object.values(state.conversations).reduce((sum, { unread }) => sum + unread, 0);
}

/** React view of the direct messages store.
 *
 *  Example: `const typing = useDirectMessages(dms, (state) => state.typing[bia.userId] === true)` */
export function useDirectMessages<T>(
  store: StoreApi<DirectMessagesStore>,
  select: (state: DirectMessagesStore) => T,
): T {
  return useStore(store, select);
}
