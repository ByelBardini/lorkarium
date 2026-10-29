import { useId } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { chatUnreadSummaryOf } from '@/lib/chat-conversations';
import {
  createChatHistoryStore,
  useChatHistory,
  type ChatHistoryStore,
} from '@/stores/chat-history-store';
import type { OpenTablesStore } from '@/stores/open-tables-store';
import { chatUnreadText } from './chat-messages';
import { UnreadCount } from './conversation-strip';
import { useOpenTableOf } from './use-chat-people';

/** The chat's counter as an owner (a tab, a button) wears it: the square drawn beside its text
 *  and the count as its description (a `hidden` text), so its name never changes. */
export type ChatUnreadMark = Readonly<{
  /** For the owner's `aria-describedby`; `undefined` with nothing unread. */
  describedBy: string | undefined;
  /** The square and the hidden text; `null` with nothing unread. */
  mark: React.JSX.Element | null;
}>;

// A table not open yet has no chat: an empty one keeps the hook's call unconditional.
const NO_CHAT = createChatHistoryStore({
  campaignId: '',
  storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  viewer: () => null,
});

/** The unread messages of one table's chat (gold when one is for the viewer).
 *
 *  Example: `const unread = useChatUnreadMark(openTables, campaignId); <button aria-describedby={unread.describedBy}>Painel{unread.mark}</button>` */
export function useChatUnreadMark(
  openTables: StoreApi<OpenTablesStore>,
  campaignId: string,
): ChatUnreadMark {
  const id = useId();
  const chat: StoreApi<ChatHistoryStore> = useOpenTableOf(openTables, campaignId)?.chat ?? NO_CHAT;
  const conversations = useChatHistory(chat, (state) => state.conversations);
  const { count, important } = chatUnreadSummaryOf(conversations);
  if (count === 0) return { describedBy: undefined, mark: null };
  const mark = (
    <>
      <UnreadCount count={count} important={important} />
      {/* Hidden: it is the owner's description, never part of its name. */}
      <span id={id} hidden>
        {chatUnreadText(count)}
      </span>
    </>
  );
  return { describedBy: id, mark };
}
