import { describe, expect, it } from 'vitest';
import type { ChatSentDto } from '@lorkarium/contracts';
import { chatFeedOf, type ChatFeedInput, type ChatFeedItem } from '@/lib/chat-feed';
import type { ChatMessage } from '@/lib/chat-conversations';
import type { DiceHistoryEntry } from '@/stores/dice-history-store';
import { ANA } from '../support/auth-api-fake';
import { chatMessageIdOf, chatSent } from '../support/chat-fixtures';
import { biaRolled, rollIdOf } from '../support/dice-fixtures';
import { BIA_AT_TABLE } from '../support/table-session-fixtures';

const LYRA_TOKEN = {
  kind: 'token',
  sceneId: '0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
  tokenId: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
  name: 'Lyra',
} as const;

function message(n: number, atMs: number, overrides: Partial<ChatSentDto> = {}): ChatMessage {
  return {
    event: chatSent({ messageId: chatMessageIdOf(n), text: `m${n}`, ...overrides }),
    receivedAtMs: atMs,
  };
}

function roll(n: number, atMs: number): DiceHistoryEntry {
  const event = biaRolled({ rollId: rollIdOf(n) });
  return { kind: 'rolled', event, receivedAtMs: atMs, revealAtMs: atMs + 2400 };
}

// One letter per item: m<n> for a message (+ when it continues the one above), r<n> a roll, | the divider.
function shapeOf(items: readonly ChatFeedItem<DiceHistoryEntry>[]): string[] {
  return items.map((item) => {
    if (item.kind === 'unread-divider') return '|';
    if (item.kind === 'roll') return `r${item.entry.event.rollId.slice(-1)}`;
    return `${item.continued ? '+' : ''}${item.message.event.text}`;
  });
}

function feed(
  messages: readonly ChatMessage[],
  options: Partial<ChatFeedInput<DiceHistoryEntry>> = {},
): string[] {
  return shapeOf(chatFeedOf({ messages, rolls: [], filter: 'all', unreadCount: 0, ...options }));
}

describe('chatFeedOf', () => {
  it('mixes the Table messages with the rolls by the time they were received', () => {
    const messages = [message(1, 1000), message(2, 3000, { fromUserId: ANA.id })];

    expect(feed(messages, { rolls: [roll(1, 2000), roll(2, 4000)] })).toEqual([
      'm1',
      'r1',
      'm2',
      'r2',
    ]);
  });

  it('a roll received at the same time as a message comes after it', () => {
    expect(feed([message(1, 1000)], { rolls: [roll(1, 1000)] })).toEqual(['m1', 'r1']);
  });

  it('"Só conversa" (talk) leaves the rolls out', () => {
    expect(feed([message(1, 1000)], { rolls: [roll(1, 2000)], filter: 'talk' })).toEqual(['m1']);
  });

  it('the same author, speaker and whisper in a row continue the message above', () => {
    expect(feed([message(1, 1000), message(2, 2000), message(3, 3000)])).toEqual([
      'm1',
      '+m2',
      '+m3',
    ]);
  });

  it('another author starts a new block', () => {
    expect(feed([message(1, 1000), message(2, 2000, { fromUserId: ANA.id })])).toEqual([
      'm1',
      'm2',
    ]);
  });

  it('the same author speaking as a token starts a new block', () => {
    expect(feed([message(1, 1000), message(2, 2000, { speaker: LYRA_TOKEN })])).toEqual([
      'm1',
      'm2',
    ]);
  });

  it('the same author whispering starts a new block', () => {
    const whisper = { channel: { kind: 'table', whisperTo: ANA.id } } as const;

    expect(feed([message(1, 1000), message(2, 2000, whisper)])).toEqual(['m1', 'm2']);
  });

  it('a roll between two messages of the same author breaks the block', () => {
    expect(feed([message(1, 1000), message(2, 3000)], { rolls: [roll(1, 2000)] })).toEqual([
      'm1',
      'r1',
      'm2',
    ]);
  });

  it('more than 5 minutes apart starts a new block', () => {
    expect(feed([message(1, 0), message(2, 5 * 60_000 + 1)])).toEqual(['m1', 'm2']);
  });

  it('two unread put the "Novas" divider before the first of them, which starts a block', () => {
    const messages = [message(1, 1000), message(2, 2000), message(3, 3000)];

    expect(feed(messages, { unreadCount: 2 })).toEqual(['m1', '|', 'm2', '+m3']);
  });

  it('every message unread puts the divider first; none unread puts none', () => {
    const messages = [message(1, 1000), message(2, 2000)];

    expect(feed(messages, { unreadCount: 5 })).toEqual(['|', 'm1', '+m2']);
    expect(feed(messages, { unreadCount: 0 })).toEqual(['m1', '+m2']);
  });

  it('a roll received before the first unread message stays above the divider', () => {
    const messages = [message(1, 1000), message(2, 3000)];

    expect(feed(messages, { rolls: [roll(1, 2000)], unreadCount: 1 })).toEqual([
      'm1',
      'r1',
      '|',
      'm2',
    ]);
  });

  it('the item keeps the message as received (speaker name and all)', () => {
    const spoken = message(1, 1000, { speaker: LYRA_TOKEN, fromUserId: BIA_AT_TABLE.userId });

    expect(chatFeedOf({ messages: [spoken], rolls: [], filter: 'all', unreadCount: 0 })).toEqual([
      { kind: 'message', message: spoken, continued: false },
    ]);
  });
});
