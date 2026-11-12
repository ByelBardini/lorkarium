import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import {
  isImportantConversation,
  type ChatConversation,
  type ChatConversationKey,
  type ChatMessage,
} from '@/lib/chat-conversations';
import { chatNoticeOf } from '@/lib/chat-notices';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { Unsubscribe } from '@/services/realtime-transport';
import type { ChatHistoryStore } from '@/stores/chat-history-store';

/** How long a preview stays above the chat bar. */
export const CHAT_PREVIEW_MS = 7000;

/** At most this many previews, and as many important notices: one more takes out the oldest. */
export const CHAT_NOTICE_LIMIT = 3;

/** One message to draw above the bar; clicking it opens `key`. */
export type ChatNoticeItem = Readonly<{
  /** The message id: the React `key`, and what `dismiss` takes. */
  id: string;
  key: ChatConversationKey;
  message: ChatMessage;
}>;

export type ChatNoticesDeps = Readonly<{
  /** The table's chat; `null` until the table opens. */
  chat: StoreApi<ChatHistoryStore> | null;
  clock: InteractionClock;
  /** The signed-in account (its own messages set off nothing); `null` while unknown. */
  viewerId: string | null;
}>;

/** Both lists oldest first. A preview leaves after `CHAT_PREVIEW_MS`; an important notice (a
 *  mention or a whisper to the viewer) stays. Either leaves once its conversation is read. */
export type ChatNotices = Readonly<{
  previews: readonly ChatNoticeItem[];
  importants: readonly ChatNoticeItem[];
  /** Takes the message out of both lists. */
  dismiss: (id: string) => void;
}>;

type NoticeLists = Readonly<Omit<ChatNotices, 'dismiss'>>;

type NoticeSource = Readonly<{
  subscribe: (onChange: () => void) => Unsubscribe;
  getSnapshot: () => NoticeLists;
  dismiss: (id: string) => void;
}>;

const NO_NOTICES: NoticeLists = { previews: [], importants: [] };

const NO_TABLE: NoticeSource = {
  subscribe: () => () => undefined,
  getSnapshot: () => NO_NOTICES,
  dismiss: () => undefined,
};

/** The previews and the important notices of the new messages of a table's chat. Shown means
 *  the store's `activeKey` (the drawer or the detached window): its messages set off nothing,
 *  and neither do the ones read back after an F5.
 *
 *  Example: `const { previews, importants } = useChatNotices({ chat: table.chat, clock: browserClock, viewerId })` */
export function useChatNotices({ chat, clock, viewerId }: ChatNoticesDeps): ChatNotices {
  const board = useMemo(() => (chat ? new ChatNoticeBoard(chat, clock) : null), [chat, clock]);
  useEffect(() => {
    board?.setViewerId(viewerId);
  }, [board, viewerId]);
  const source = board ?? NO_TABLE;
  const lists = useSyncExternalStore(source.subscribe, source.getSnapshot);
  return useMemo(() => ({ ...lists, dismiss: source.dismiss }), [lists, source]);
}

// Listens to the chat only while React subscribes, so a board made and dropped by a render
// leaves no listener nor clock behind.
class ChatNoticeBoard implements NoticeSource {
  private lists: NoticeLists = NO_NOTICES;
  private viewerId: string | null = null;
  private readonly expiries = new Map<string, () => void>();
  private readonly onChanges = new Set<() => void>();
  private stops: readonly Unsubscribe[] = [];

  constructor(
    private readonly chat: StoreApi<ChatHistoryStore>,
    private readonly clock: InteractionClock,
  ) {}

  readonly subscribe = (onChange: () => void): Unsubscribe => {
    this.onChanges.add(onChange);
    if (this.onChanges.size === 1) this.start();
    return () => {
      this.onChanges.delete(onChange);
      if (this.onChanges.size === 0) this.stop();
    };
  };

  readonly getSnapshot = (): NoticeLists => this.lists;

  readonly dismiss = (id: string): void => {
    const { previews, importants } = this.lists;
    const next = { previews: without(previews, id), importants: without(importants, id) };
    if (next.previews !== previews || next.importants !== importants) this.commit(next);
  };

  setViewerId(viewerId: string | null): void {
    this.viewerId = viewerId;
  }

  private start(): void {
    const state = this.chat.getState();
    this.stops = [
      state.onNewMessage((message, key, calls) => this.hear(message, key, calls)),
      this.chat.subscribe((next) => this.prune(next.conversations)),
    ];
  }

  private stop(): void {
    for (const stop of this.stops) stop();
    for (const cancel of this.expiries.values()) cancel();
    this.stops = [];
    this.expiries.clear();
    this.lists = NO_NOTICES;
  }

  private hear(message: ChatMessage, key: ChatConversationKey, calls: boolean): void {
    const shownKey = this.chat.getState().activeKey;
    const notice = chatNoticeOf({ message, key, calls, viewerId: this.viewerId, shownKey });
    if (!notice.preview) return;
    const item: ChatNoticeItem = { id: message.event.messageId, key, message };
    const { previews, importants } = this.lists;
    const nextImportants = notice.important ? withLatest(importants, item) : importants;
    this.commit({ previews: withLatest(previews, item), importants: nextImportants });
    this.expireLater(item.id);
  }

  private expireLater(id: string): void {
    const cancel = this.clock.after(CHAT_PREVIEW_MS, () => {
      this.expiries.delete(id);
      this.commit({ ...this.lists, previews: without(this.lists.previews, id) });
    });
    this.expiries.set(id, cancel);
  }

  private prune(conversations: readonly ChatConversation[]): void {
    const { lists } = this;
    const previews = lists.previews.filter((item) => keepsPreview(conversations, item));
    const importants = lists.importants.filter((item) => keepsImportant(conversations, item));
    if (previews.length === lists.previews.length && importants.length === lists.importants.length)
      return;
    this.commit({ previews, importants });
  }

  // Every change goes through here: a preview that left stops waiting on the clock.
  private commit(next: NoticeLists): void {
    for (const [id, cancel] of this.expiries) {
      if (next.previews.some((item) => item.id === id)) continue;
      cancel();
      this.expiries.delete(id);
    }
    this.lists = next;
    for (const onChange of this.onChanges) onChange();
  }
}

function withLatest(
  items: readonly ChatNoticeItem[],
  item: ChatNoticeItem,
): readonly ChatNoticeItem[] {
  return [...items, item].slice(-CHAT_NOTICE_LIMIT);
}

function without(items: readonly ChatNoticeItem[], id: string): readonly ChatNoticeItem[] {
  return items.some((item) => item.id === id) ? items.filter((item) => item.id !== id) : items;
}

function conversationOfItem(
  conversations: readonly ChatConversation[],
  item: ChatNoticeItem,
): ChatConversation | undefined {
  return conversations.find((each) => each.key === item.key);
}

// Read (set active, marked read, closed, cleared) leaves no unread: the preview has no news.
function keepsPreview(conversations: readonly ChatConversation[], item: ChatNoticeItem): boolean {
  return (conversationOfItem(conversations, item)?.unread ?? 0) > 0;
}

function keepsImportant(conversations: readonly ChatConversation[], item: ChatNoticeItem): boolean {
  const conversation = conversationOfItem(conversations, item);
  return conversation !== undefined && isImportantConversation(conversation);
}
