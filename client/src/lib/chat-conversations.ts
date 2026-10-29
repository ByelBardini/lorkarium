import type { ChatSentChannelDto, ChatSentDto } from '@lorkarium/contracts';
import { searchText } from './search-text';

/** The messages one conversation keeps for this visit (an F5 included). */
export const CHAT_HISTORY_LIMIT = 300;

/** The one name of a conversation, the same on every screen: the Table, a direct by the other
 *  person's id, a group by its id. */
export type ChatConversationKey = 'table' | `direct:${string}` | `group:${string}`;

export const TABLE_CONVERSATION_KEY: ChatConversationKey = 'table';

/** A fixed group: name and members never change; another group is another id. */
export type ChatGroup = Readonly<{ groupId: string; name: string; memberIds: readonly string[] }>;

/** Who a conversation is with, as the viewer sees it (a direct names only the other person). */
export type ChatConversationTarget =
  | Readonly<{ kind: 'table' }>
  | Readonly<{ kind: 'direct'; userId: string }>
  | (Readonly<{ kind: 'group' }> & ChatGroup);

/** One message as this tab received it; `receivedAtMs` is wall clock, like the dice history. */
export type ChatMessage = Readonly<{ event: ChatSentDto; receivedAtMs: number }>;

/** `unread` counts the messages of others that arrived while it was not the open one;
 *  `mentioned` says one of them named the viewer (`@Ana`) or whispered to them. */
export type ChatConversation = Readonly<{
  key: ChatConversationKey;
  target: ChatConversationTarget;
  /** Oldest first, at most `CHAT_HISTORY_LIMIT`. */
  messages: readonly ChatMessage[];
  unread: number;
  mentioned: boolean;
  /** Hidden from the strip locally; messages stay for this visit. */
  closed?: boolean;
}>;

/** Who reads: the id (to tell their own messages and the other person of a direct) and the
 *  names an `@` may call them by. */
export type ChatViewer = Readonly<{ userId: string; names: readonly string[] }>;

/** What a received message needs to know about the screen. */
export type ChatReceiveContext = Readonly<{
  viewer: ChatViewer | null;
  activeKey: ChatConversationKey | null;
}>;

export const EMPTY_TABLE_CONVERSATION: ChatConversation = {
  key: TABLE_CONVERSATION_KEY,
  target: { kind: 'table' },
  messages: [],
  unread: 0,
  mentioned: false,
};

/** The key of a conversation.
 *
 *  Example: `conversationKeyOf({ kind: 'direct', userId: bia }) // 'direct:<bia>'` */
export function conversationKeyOf(target: ChatConversationTarget): ChatConversationKey {
  if (target.kind === 'direct') return `direct:${target.userId}`;
  if (target.kind === 'group') return `group:${target.groupId}`;
  return TABLE_CONVERSATION_KEY;
}

/** The conversation an event belongs to for this viewer; `null` for a direct the viewer is not
 *  in (or while the viewer is unknown).
 *
 *  Example: `conversationTargetOf({ kind: 'direct', userIds: [ana, bia] }, ana) // { kind: 'direct', userId: bia }` */
export function conversationTargetOf(
  channel: ChatSentChannelDto,
  viewerId: string | null,
): ChatConversationTarget | null {
  if (channel.kind === 'table') return { kind: 'table' };
  if (channel.kind === 'group') {
    const { groupId, name, memberIds } = channel;
    return { kind: 'group', groupId, name, memberIds };
  }
  const [first, second] = channel.userIds;
  if (viewerId === first) return { kind: 'direct', userId: second };
  if (viewerId === second) return { kind: 'direct', userId: first };
  return null;
}

/** Whether `text` calls one of `names` with an `@`, ignoring accent and case; the name must end
 *  there (`@Bia` is not in `@Biatriz`) and the `@` must not sit inside a word (an e-mail).
 *
 *  Example: `mentionsAny('@bia rola', ['Bia']) // true` */
export function mentionsAny(text: string, names: readonly string[]): boolean {
  const folded = searchText(text);
  return names.some((name) => name.trim() !== '' && mentionPatternOf(name).test(folded));
}

/** The conversations with `target` in them (empty if new, untouched if already there).
 *
 *  Example: `withConversation([EMPTY_TABLE_CONVERSATION], { kind: 'direct', userId: caio })` */
export function withConversation(
  conversations: readonly ChatConversation[],
  target: ChatConversationTarget,
): readonly ChatConversation[] {
  const key = conversationKeyOf(target);
  const known = conversations.find((each) => each.key === key);
  if (known && !known.closed) return conversations;
  if (known) {
    return conversations.map((each) =>
      each.key === key && each.closed ? { ...each, closed: false } : each,
    );
  }
  return [...conversations, { ...EMPTY_TABLE_CONVERSATION, key, target }];
}

/** The conversations with `key` read: no unread, no mention.
 *
 *  Example: `withRead(conversations, 'table')` */
export function withRead(
  conversations: readonly ChatConversation[],
  key: ChatConversationKey,
): readonly ChatConversation[] {
  return conversations.map((each) =>
    each.key === key && (each.unread > 0 || each.mentioned)
      ? { ...each, unread: 0, mentioned: false }
      : each,
  );
}

/** The conversations with `message` in its conversation, or `null` when it does not enter: a
 *  direct that is not the viewer's, a `messageId` already there, or a known group arriving with
 *  other members (a group is fixed). The oldest leaves past `CHAT_HISTORY_LIMIT`.
 *
 *  Example: `withReceived(conversations, { event, receivedAtMs }, { viewer, activeKey: null })?.key` */
export function withReceived(
  conversations: readonly ChatConversation[],
  message: ChatMessage,
  context: ChatReceiveContext,
): Readonly<{ conversations: readonly ChatConversation[]; key: ChatConversationKey }> | null {
  const target = conversationTargetOf(message.event.channel, context.viewer?.userId ?? null);
  if (target === null) return null;
  const key = conversationKeyOf(target);
  const known = conversations.find((each) => each.key === key);
  if (known && !takesMessage(known, target, message)) return null;
  const base = known?.closed
    ? { ...known, closed: false }
    : (known ?? { ...EMPTY_TABLE_CONVERSATION, key, target });
  const grown = withMessage(base, message, context);
  const next = known
    ? conversations.map((each) => (each.key === key ? grown : each))
    : [...conversations, grown];
  return { conversations: next, key };
}

/** The strip's order: the Table first, then a conversation still without messages (just
 *  started here), then the rest by the latest message.
 *
 *  Example: `stripOrderOf(conversations)[0].key // 'table'` */
export function stripOrderOf(
  conversations: readonly ChatConversation[],
): readonly ChatConversation[] {
  const table = conversations.filter((each) => each.key === TABLE_CONVERSATION_KEY);
  const others = conversations.filter((each) => each.key !== TABLE_CONVERSATION_KEY);
  return [...table, ...others.sort((a, b) => lastActivityOf(b) - lastActivityOf(a))];
}

/** What the "Chat" badge shows: every unread message, and whether one is important (a direct, a
 *  group, a mention or a whisper to the viewer), drawn in gold.
 *
 *  Example: `chatUnreadSummaryOf(conversations) // { count: 3, important: true }` */
export function chatUnreadSummaryOf(
  conversations: readonly ChatConversation[],
): Readonly<{ count: number; important: boolean }> {
  const count = conversations.reduce((total, each) => total + each.unread, 0);
  const important = conversations.some(
    (each) => each.mentioned || (each.unread > 0 && each.target.kind !== 'table'),
  );
  return { count, important };
}

// A conversation with no message yet was just opened here: it goes before every other.
function lastActivityOf(conversation: ChatConversation): number {
  return conversation.messages.at(-1)?.receivedAtMs ?? Number.POSITIVE_INFINITY;
}

function takesMessage(
  known: ChatConversation,
  target: ChatConversationTarget,
  message: ChatMessage,
): boolean {
  const { messageId } = message.event;
  if (known.messages.some((kept) => kept.event.messageId === messageId)) return false;
  if (known.target.kind !== 'group' || target.kind !== 'group') return true;
  return sameMembers(known.target.memberIds, target.memberIds);
}

function withMessage(
  conversation: ChatConversation,
  message: ChatMessage,
  context: ChatReceiveContext,
): ChatConversation {
  const messages = [...conversation.messages, message].slice(-CHAT_HISTORY_LIMIT);
  const { viewer } = context;
  const fromOther = message.event.fromUserId !== viewer?.userId;
  if (!fromOther || context.activeKey === conversation.key) return { ...conversation, messages };
  const mentioned = conversation.mentioned || callsViewer(message.event, viewer);
  return { ...conversation, messages, unread: conversation.unread + 1, mentioned };
}

function callsViewer(event: ChatSentDto, viewer: ChatViewer | null): boolean {
  if (viewer === null) return false;
  const whisperedTo = event.channel.kind === 'table' ? event.channel.whisperTo : null;
  return whisperedTo === viewer.userId || mentionsAny(event.text, viewer.names);
}

function sameMembers(kept: readonly string[], arrived: readonly string[]): boolean {
  return kept.length === arrived.length && arrived.every((id) => kept.includes(id));
}

// The name is folded like the text, and escaped: a name is data, never a pattern.
function mentionPatternOf(name: string): RegExp {
  const escaped = searchText(name.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}_])@${escaped}(?![\\p{L}\\p{N}_])`, 'u');
}
