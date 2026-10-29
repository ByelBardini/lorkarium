import type { ChatSentDto } from '@lorkarium/contracts';
import type { ChatMessage } from './chat-conversations';

/** "Tudo" shows the Table's rolls among the messages; "Só conversa" (`talk`) leaves them out. */
export type ChatFeedFilter = 'all' | 'talk';

/** Messages of one author further apart than this start a new block. */
export const CHAT_BLOCK_GAP_MS = 5 * 60_000;

/** One row of the feed. `continued`: same author, speaker and whisper as the message right
 *  above, so the row draws without the header. The divider ("Novas") comes before the first
 *  unread message. */
export type ChatFeedItem<Roll> =
  | Readonly<{ kind: 'message'; message: ChatMessage; continued: boolean }>
  | Readonly<{ kind: 'roll'; entry: Roll }>
  | Readonly<{ kind: 'unread-divider' }>;

/** `rolls`: the dice history's entries (only the Table's feed passes them), oldest first;
 *  `unreadCount`: how many of the last messages were unread when the conversation opened. */
export type ChatFeedInput<Roll> = Readonly<{
  messages: readonly ChatMessage[];
  rolls: readonly Roll[];
  filter: ChatFeedFilter;
  unreadCount: number;
}>;

type Timed = Readonly<{ receivedAtMs: number }>;

type Entry<Roll> =
  Readonly<{ kind: 'message'; message: ChatMessage }> | Readonly<{ kind: 'roll'; entry: Roll }>;

/** The feed of a conversation: messages and rolls by the time they arrived (a roll after a
 *  message of the same instant), blocks of one author, and the "Novas" divider.
 *
 *  Example: `chatFeedOf({ messages, rolls: dice.entries, filter: 'all', unreadCount: 2 })` */
export function chatFeedOf<Roll extends Timed>(input: ChatFeedInput<Roll>): ChatFeedItem<Roll>[] {
  const rolls = input.filter === 'talk' ? [] : input.rolls;
  const firstUnreadIndex = Math.max(0, input.messages.length - input.unreadCount);
  const firstUnreadMessage = input.unreadCount > 0 ? input.messages[firstUnreadIndex] : undefined;
  const items: ChatFeedItem<Roll>[] = [];
  for (const entry of mergedByTime(input.messages, rolls)) {
    if (entry.kind === 'roll') {
      items.push(entry);
      continue;
    }
    if (entry.message === firstUnreadMessage) items.push({ kind: 'unread-divider' });
    items.push({ ...entry, continued: continues(items.at(-1), entry.message) });
  }
  return items;
}

function mergedByTime<Roll extends Timed>(
  messages: readonly ChatMessage[],
  rolls: readonly Roll[],
): Entry<Roll>[] {
  const merged: Entry<Roll>[] = [];
  let at = 0;
  for (const message of messages) {
    // A roll of the same instant as the message goes after it.
    for (let roll = rolls[at]; roll && roll.receivedAtMs < message.receivedAtMs; roll = rolls[at]) {
      merged.push({ kind: 'roll', entry: roll });
      at += 1;
    }
    merged.push({ kind: 'message', message });
  }
  return [...merged, ...rolls.slice(at).map((entry) => ({ kind: 'roll' as const, entry }))];
}

function continues<Roll>(above: ChatFeedItem<Roll> | undefined, message: ChatMessage): boolean {
  if (above?.kind !== 'message') return false;
  if (message.receivedAtMs - above.message.receivedAtMs > CHAT_BLOCK_GAP_MS) return false;
  return voiceOf(above.message.event) === voiceOf(message.event);
}

// Author, who they spoke as and to whom they whispered: the same voice draws as one block.
function voiceOf(event: ChatSentDto): string {
  const speaker = event.speaker.kind === 'token' ? event.speaker.tokenId : 'self';
  const whisper = event.channel.kind === 'table' ? (event.channel.whisperTo ?? '') : '';
  return `${event.fromUserId}|${speaker}|${whisper}`;
}
