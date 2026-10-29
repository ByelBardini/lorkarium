import { chatSentDto } from '@lorkarium/contracts';
import { z } from 'zod';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  CHAT_HISTORY_LIMIT,
  EMPTY_TABLE_CONVERSATION,
  conversationKeyOf,
  withConversation,
  withRead,
  withReceived,
  type ChatConversation,
  type ChatConversationKey,
  type ChatConversationTarget,
  type ChatMessage,
  type ChatViewer,
} from '@/lib/chat-conversations';
import type { Unsubscribe } from '@/services/realtime-transport';
import type { TableSessionUpdate } from '@/services/table-session-api';
import type { TabStorage } from '@/stores/scene-tabs-storage';

export { CHAT_HISTORY_LIMIT } from '@/lib/chat-conversations';
export type { ChatViewer } from '@/lib/chat-conversations';

const CHAT_HISTORY_STORAGE_PREFIX = 'lorkarium.chat.';

export type ChatMessageListener = (message: ChatMessage, key: ChatConversationKey) => void;

export type ChatHistoryState = Readonly<{
  campaignId: string;
  /** The Table first, then the others in the order they appeared. */
  conversations: readonly ChatConversation[];
  /** The conversation on screen; `null` while the chat is not shown (unread rises everywhere). */
  activeKey: ChatConversationKey | null;
}>;

export type ChatHistoryStore = ChatHistoryState &
  Readonly<{
    /** Takes a `chatSent` of this table into its conversation; any other update is ignored. */
    apply: (update: TableSessionUpdate, receivedAtMs: number) => void;
    /** A conversation opened here before any message (a direct, or a group being created);
     *  answers its key. Already there: untouched. */
    startConversation: (target: ChatConversationTarget) => ChatConversationKey;
    /** Hides a private/group locally, preserving its visit history; Table stays open. */
    closeConversation: (key: ChatConversationKey) => void;
    /** The conversation now on screen (read at once), or `null` when the chat is hidden. */
    setActive: (key: ChatConversationKey | null) => void;
    markRead: (key: ChatConversationKey) => void;
    /** Leaving the table: forgets every conversation and the storage key. */
    clear: () => void;
    /** Hears each message as it enters (the announcer, the speech balloon), never the ones
     *  read back from the storage. */
    onNewMessage: (listener: ChatMessageListener) => Unsubscribe;
  }>;

/** `viewer`: who reads, asked at each message (the roster may arrive after the table opens). */
export type ChatHistoryDeps = Readonly<{
  campaignId: string;
  storage: TabStorage;
  viewer: () => ChatViewer | null;
}>;

type SetChat = StoreApi<ChatHistoryStore>['setState'];
type GetChat = StoreApi<ChatHistoryStore>['getState'];

// Not a network DTO: only what this tab wrote for itself, read back defensively.
const storedTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('table') }),
  z.object({ kind: z.literal('direct'), userId: z.string() }),
  z.object({
    kind: z.literal('group'),
    groupId: z.string(),
    name: z.string(),
    memberIds: z.array(z.string()),
  }),
]);

const storedConversationsSchema = z.object({
  conversations: z.array(
    z.object({
      target: storedTargetSchema,
      messages: z
        .array(z.object({ event: chatSentDto, receivedAtMs: z.number() }))
        .max(CHAT_HISTORY_LIMIT),
      unread: z.number().int().nonnegative(),
      mentioned: z.boolean(),
      closed: z.boolean().optional(),
    }),
  ),
});

/** The `sessionStorage` key of one table's chat.
 *
 *  Example: `chatHistoryStorageKey(campaignId) // 'lorkarium.chat.<campaignId>'` */
export function chatHistoryStorageKey(campaignId: string): string {
  return CHAT_HISTORY_STORAGE_PREFIX + campaignId;
}

/** The chat of one open table (Zustand vanilla, one per table, made by the open tables store):
 *  the conversations of this visit, kept in `sessionStorage` so an F5 keeps them; a storage
 *  that throws (or is full) leaves them in memory.
 *
 *  Example: `createChatHistoryStore({ campaignId, storage: sessionStorage, viewer: () => null }).getState().apply(update, Date.now())` */
export function createChatHistoryStore(deps: ChatHistoryDeps): StoreApi<ChatHistoryStore> {
  const listeners = new Set<ChatMessageListener>();
  return createStore<ChatHistoryStore>()((set, get) => ({
    campaignId: deps.campaignId,
    conversations: readStored(deps),
    activeKey: null,
    apply: (update, receivedAtMs) => {
      if (update.kind !== 'chatSent' || update.event.campaignId !== deps.campaignId) return;
      const message = { event: update.event, receivedAtMs };
      const key = receive(deps, set, get, message);
      if (key !== null) for (const listener of listeners) listener(message, key);
    },
    startConversation: (target) => {
      save(deps, set, withConversation(get().conversations, target));
      return conversationKeyOf(target);
    },
    closeConversation: (key) => closeConversation(deps, set, get, key),
    setActive: (key) => {
      set({ activeKey: key });
      if (key !== null) save(deps, set, withRead(get().conversations, key));
    },
    markRead: (key) => save(deps, set, withRead(get().conversations, key)),
    clear: () => {
      set({ conversations: [EMPTY_TABLE_CONVERSATION], activeKey: null });
      removeStored(deps);
    },
    onNewMessage: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  }));
}

/** React view of a slice of one table's chat.
 *
 *  Example: `const conversations = useChatHistory(table.chat, (state) => state.conversations)` */
export function useChatHistory<T>(
  store: StoreApi<ChatHistoryStore>,
  selector: (state: ChatHistoryStore) => T,
): T {
  return useStore(store, selector);
}

function receive(
  deps: ChatHistoryDeps,
  set: SetChat,
  get: GetChat,
  message: ChatMessage,
): ChatConversationKey | null {
  const context = { viewer: deps.viewer(), activeKey: get().activeKey };
  const received = withReceived(get().conversations, message, context);
  if (received === null) return null;
  save(deps, set, received.conversations);
  return received.key;
}

function closeConversation(
  deps: ChatHistoryDeps,
  set: SetChat,
  get: GetChat,
  key: ChatConversationKey,
): void {
  if (key === 'table') return;
  const { conversations, activeKey } = get();
  if (!conversations.some((each) => each.key === key)) return;
  const closed = conversations.map((each) =>
    each.key === key ? { ...each, closed: true, unread: 0, mentioned: false } : each,
  );
  if (activeKey === key) set({ activeKey: 'table' });
  save(deps, set, activeKey === key ? withRead(closed, 'table') : closed);
}

function save(
  deps: ChatHistoryDeps,
  set: SetChat,
  conversations: readonly ChatConversation[],
): void {
  set({ conversations });
  writeStored(deps, conversations);
}

function readStored({ campaignId, storage }: ChatHistoryDeps): readonly ChatConversation[] {
  try {
    const raw = storage.getItem(chatHistoryStorageKey(campaignId));
    if (raw === null) return [EMPTY_TABLE_CONVERSATION];
    const parsed = storedConversationsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? withTableFirst(parsed.data.conversations) : [EMPTY_TABLE_CONVERSATION];
  } catch {
    return [EMPTY_TABLE_CONVERSATION];
  }
}

// The key is never stored: it is rebuilt from the target, so the two cannot disagree.
function withTableFirst(
  stored: readonly Omit<ChatConversation, 'key'>[],
): readonly ChatConversation[] {
  const read = stored.map((each) => ({ ...each, key: conversationKeyOf(each.target) }));
  const table = read.find((each) => each.key === 'table') ?? EMPTY_TABLE_CONVERSATION;
  return [table, ...read.filter((each) => each.key !== 'table')];
}

function writeStored(
  { campaignId, storage }: ChatHistoryDeps,
  conversations: readonly ChatConversation[],
): void {
  const stored = conversations.map(({ target, messages, unread, mentioned, closed }) => ({
    target,
    messages,
    unread,
    mentioned,
    closed,
  }));
  try {
    storage.setItem(chatHistoryStorageKey(campaignId), JSON.stringify({ conversations: stored }));
  } catch {
    // Keeps working in memory for this visit.
  }
}

function removeStored({ campaignId, storage }: ChatHistoryDeps): void {
  try {
    storage.removeItem(chatHistoryStorageKey(campaignId));
  } catch {
    // Nothing was stored to begin with.
  }
}
