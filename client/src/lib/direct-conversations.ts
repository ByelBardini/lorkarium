import type { DmSentDto } from '@lorkarium/contracts';

/** The messages one conversation with a friend keeps on this device. */
export const DIRECT_HISTORY_LIMIT = 200;

/** How long "digitando…" stays without a new `dm:typingFrom`. */
export const TYPING_SHOWN_MS = 4000;

const DM_STORAGE_PREFIX = 'lorkarium.dm.';

/** The messages with one friend, oldest first, and how many of theirs arrived unseen. */
export type DirectConversation = Readonly<{
  friendId: string;
  messages: readonly DmSentDto[];
  unread: number;
}>;

/** The `localStorage` key of one conversation: per account, so another account on the same
 *  browser never reads it.
 *
 *  Example: `directConversationStorageKey(me, bia) // 'lorkarium.dm.<me>.<bia>'` */
export function directConversationStorageKey(accountId: string, friendId: string): string {
  return `${DM_STORAGE_PREFIX}${accountId}.${friendId}`;
}

/** The key that lists which friends the account has a conversation with (the storage cannot
 *  enumerate its keys).
 *
 *  Example: `directIndexStorageKey(me) // 'lorkarium.dm.<me>'` */
export function directIndexStorageKey(accountId: string): string {
  return DM_STORAGE_PREFIX + accountId;
}

/** The other side of a message for `accountId`; `null` when the account is in neither side.
 *
 *  Example: `friendIdOf({ fromUserId: me, toUserId: bia, ... }, me) // bia` */
export function friendIdOf(event: DmSentDto, accountId: string): string | null {
  if (event.fromUserId === accountId) return event.toUserId;
  if (event.toUserId === accountId) return event.fromUserId;
  return null;
}

/** The conversation with `event` at the end (once per message id), at most
 *  `DIRECT_HISTORY_LIMIT` (the oldest go); a message of the friend counts as unread unless the
 *  conversation is the one on screen.
 *
 *  Example: `withDirectMessage(conversation, event, { open: false })` */
export function withDirectMessage(
  conversation: DirectConversation,
  event: DmSentDto,
  screen: Readonly<{ open: boolean }>,
): DirectConversation {
  if (conversation.messages.some(({ messageId }) => messageId === event.messageId)) {
    return conversation;
  }
  const messages = [...conversation.messages, event].slice(-DIRECT_HISTORY_LIMIT);
  const fromFriend = event.fromUserId === conversation.friendId;
  const unread = conversation.unread + (fromFriend && !screen.open ? 1 : 0);
  return { ...conversation, messages, unread };
}

/** A conversation with no message yet. Example: `emptyDirectConversation(bia.userId)` */
export function emptyDirectConversation(friendId: string): DirectConversation {
  return { friendId, messages: [], unread: 0 };
}
