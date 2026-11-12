import type { ChatConversationKey, ChatMessage, ChatUnreadSummary } from './chat-conversations';

/** What one new message sets off: a preview rising from the chat bar, and whether it is also an
 *  important notice (gold, kept until read). */
export type ChatNotice = Readonly<{ preview: boolean; important: boolean }>;

/** One message as the chat store hands it to its listeners, and who reads what. */
export type ChatNoticeInput = Readonly<{
  message: ChatMessage;
  key: ChatConversationKey;
  /** From the store (`callsViewer`): it whispers to the viewer or names them by `@`. */
  calls: boolean;
  /** The signed-in account; `null` while unknown (every message is someone else's). */
  viewerId: string | null;
  /** The conversation on screen, in the drawer or in a detached window; `null` when hidden. */
  shownKey: ChatConversationKey | null;
}>;

const NO_NOTICE: ChatNotice = { preview: false, important: false };

const TITLE_PREFIX = 'Lorkarium · ';

/** What a new message sets off: nothing for the viewer's own nor for the conversation on screen;
 *  otherwise a preview, important when it calls the viewer.
 *
 *  Example: `chatNoticeOf({ message, key: 'table', calls: true, viewerId: bia, shownKey: null }) // { preview: true, important: true }` */
export function chatNoticeOf(input: ChatNoticeInput): ChatNotice {
  if (input.message.event.fromUserId === input.viewerId) return NO_NOTICE;
  if (input.key === input.shownKey) return NO_NOTICE;
  return { preview: true, important: input.calls };
}

/** The browser tab's title of a table, with the unread count first (`!` when one is important).
 *
 *  Example: `chatTitleOf('Vharn', { count: 3, important: true }) // '(3!) Lorkarium · Vharn'` */
export function chatTitleOf(tableName: string, unread: ChatUnreadSummary): string {
  const title = TITLE_PREFIX + tableName;
  if (unread.count === 0) return title;
  return `(${unread.count}${unread.important ? '!' : ''}) ${title}`;
}
