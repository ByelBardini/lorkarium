import type { ChatSentDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_TABLE_CONVERSATION,
  chatUnreadSummaryOf,
  conversationKeyOf,
  conversationTargetOf,
  isImportantConversation,
  mentionsAny,
  stripOrderOf,
  withConversation,
  withRead,
  withReceived,
  type ChatConversation,
  type ChatViewer,
} from '@/lib/chat-conversations';
import { ANA } from '../support/auth-api-fake';
import {
  TRIO_GROUP_ID,
  chatMessageIdOf,
  chatSent,
  directBetween,
  trioGroup,
} from '../support/chat-fixtures';
import { BIA_AT_TABLE, CAIO_AT_TABLE } from '../support/table-session-fixtures';

const BIA = BIA_AT_TABLE.userId;
const CAIO = CAIO_AT_TABLE.userId;
const TRIO = {
  kind: 'group',
  groupId: TRIO_GROUP_ID,
  name: 'Os Três',
  memberIds: [ANA.id, BIA, CAIO],
} as const;

const BIA_READS: ChatViewer = { userId: BIA, names: ['Bia', 'bia'] };

function fromAna(overrides: Partial<ChatSentDto> = {}): ChatSentDto {
  return chatSent({ fromUserId: ANA.id, ...overrides });
}

// Bia's conversations after `events` arrive with her chat hidden (nothing active).
function receivedByBia(...events: ChatSentDto[]): readonly ChatConversation[] {
  return events.reduce<readonly ChatConversation[]>(
    (conversations, event) => {
      const message = { event, receivedAtMs: 1000 };
      const next = withReceived(conversations, message, { viewer: BIA_READS, activeKey: null });
      if (next === null) throw new Error(`event ${event.messageId} refused for Bia`);
      return next.conversations;
    },
    [EMPTY_TABLE_CONVERSATION],
  );
}

function conversationWith(
  target: ChatConversation['target'],
  lastAtMs: number | null,
  overrides: Partial<ChatConversation> = {},
): ChatConversation {
  const messages = lastAtMs === null ? [] : [{ event: chatSent(), receivedAtMs: lastAtMs }];
  return {
    ...EMPTY_TABLE_CONVERSATION,
    key: conversationKeyOf(target),
    target,
    messages,
    ...overrides,
  };
}

describe('conversationKeyOf', () => {
  it.each([
    [{ kind: 'table' } as const, 'table'],
    [{ kind: 'direct', userId: BIA } as const, `direct:${BIA}`],
    [TRIO, `group:${TRIO_GROUP_ID}`],
  ])('%j is %s', (target, key) => {
    expect(conversationKeyOf(target)).toBe(key);
  });
});

describe('conversationTargetOf', () => {
  it('a whisper of the Table belongs to the Table', () => {
    expect(conversationTargetOf({ kind: 'table', whisperTo: ANA.id }, ANA.id)).toEqual({
      kind: 'table',
    });
  });

  it('a group carries its name and members', () => {
    expect(conversationTargetOf(trioGroup(), ANA.id)).toEqual({
      kind: 'group',
      groupId: TRIO_GROUP_ID,
      name: 'Os Três',
      memberIds: [ANA.id, BIA, CAIO],
    });
  });

  it('a direct is with the other person of the pair, whichever side the viewer is on', () => {
    expect(conversationTargetOf(directBetween(ANA.id, BIA), ANA.id)).toEqual({
      kind: 'direct',
      userId: BIA,
    });
    expect(conversationTargetOf(directBetween(ANA.id, BIA), BIA)).toEqual({
      kind: 'direct',
      userId: ANA.id,
    });
  });

  it('a direct the viewer is not in has no conversation', () => {
    expect(conversationTargetOf(directBetween(BIA, CAIO), ANA.id)).toBeNull();
  });
});

describe('mentionsAny', () => {
  it.each([
    ['@Bia, sua vez', true],
    ['vai @bia', true],
    ['@BÍA!', true],
    ['@Biatriz chegou', false],
    ['bia sem arroba', false],
    ['mande para x@bia.com', false],
  ])('"%s" mentions Bia: %s', (text, expected) => {
    expect(mentionsAny(text, ['Bia'])).toBe(expected);
  });

  it('a name with spaces is mentioned whole', () => {
    expect(mentionsAny('oi @Ana Clara', ['Ana Clara'])).toBe(true);
    expect(mentionsAny('oi @Ana', ['Ana Clara'])).toBe(false);
  });

  it('a name with pattern characters is taken literally', () => {
    expect(mentionsAny('@a.b oi', ['a.b'])).toBe(true);
    expect(mentionsAny('@axb oi', ['a.b'])).toBe(false);
  });

  it('a blank name is never mentioned', () => {
    expect(mentionsAny('@ oi', [' '])).toBe(false);
  });
});

describe('withConversation', () => {
  it('adds a new conversation empty and keeps an existing one as it is', () => {
    const table = conversationWith({ kind: 'table' }, 1000, { unread: 2 });
    const added = withConversation([table], { kind: 'direct', userId: BIA });

    expect(added.map((each) => each.key)).toEqual(['table', `direct:${BIA}`]);
    expect(withConversation(added, { kind: 'table' })).toBe(added);
  });
});

describe('stripOrderOf', () => {
  it('the Table first, then the rest by the latest message, a conversation still empty right after the Table', () => {
    const table = conversationWith({ kind: 'table' }, 9000);
    const old = conversationWith({ kind: 'direct', userId: BIA }, 1000);
    const recent = conversationWith({ kind: 'direct', userId: CAIO }, 5000);
    const fresh = conversationWith(TRIO, null);

    expect(stripOrderOf([old, table, recent, fresh]).map((each) => each.key)).toEqual([
      'table',
      `group:${TRIO_GROUP_ID}`,
      `direct:${CAIO}`,
      `direct:${BIA}`,
    ]);
  });
});

describe('chatUnreadSummaryOf', () => {
  it('nothing unread is zero, not important', () => {
    expect(chatUnreadSummaryOf([EMPTY_TABLE_CONVERSATION])).toEqual({ count: 0, important: false });
  });

  it('unread only at the Table counts, not important', () => {
    const table = conversationWith({ kind: 'table' }, 1000, { unread: 3 });

    expect(chatUnreadSummaryOf([table])).toEqual({ count: 3, important: false });
  });

  it('a Table message calling Bia by @, unread, is important for her', () => {
    const conversations = receivedByBia(fromAna({ text: '@Bia, sua vez.' }));

    expect(chatUnreadSummaryOf(conversations)).toEqual({ count: 1, important: true });
  });

  it('Ana whispering to Bia at the Table is important for Bia', () => {
    const conversations = receivedByBia(fromAna({ channel: { kind: 'table', whisperTo: BIA } }));

    expect(chatUnreadSummaryOf(conversations)).toEqual({ count: 1, important: true });
  });

  it('a direct with 3 unread and no mention counts them, neutral', () => {
    const direct = directBetween(ANA.id, BIA);
    const conversations = receivedByBia(
      fromAna({ messageId: chatMessageIdOf(1), channel: direct }),
      fromAna({ messageId: chatMessageIdOf(2), channel: direct }),
      fromAna({ messageId: chatMessageIdOf(3), channel: direct }),
    );

    expect(chatUnreadSummaryOf(conversations)).toEqual({ count: 3, important: false });
  });

  it('the group "Os Três" with 2 unread counts them, neutral', () => {
    const conversations = receivedByBia(
      fromAna({ messageId: chatMessageIdOf(1), channel: trioGroup() }),
      fromAna({ messageId: chatMessageIdOf(2), channel: trioGroup() }),
    );

    expect(chatUnreadSummaryOf(conversations)).toEqual({ count: 2, important: false });
  });

  it('a direct calling Bia by @ is important', () => {
    const channel = directBetween(ANA.id, BIA);
    const conversations = receivedByBia(fromAna({ channel, text: '@Bia, vem cá.' }));

    expect(chatUnreadSummaryOf(conversations)).toEqual({ count: 1, important: true });
  });

  it('a mention already read is no longer important', () => {
    const conversations = receivedByBia(fromAna({ text: '@Bia, sua vez.' }));

    expect(chatUnreadSummaryOf(withRead(conversations, 'table'))).toEqual({
      count: 0,
      important: false,
    });
  });
});

describe('isImportantConversation', () => {
  const direct = directBetween(ANA.id, BIA);
  it.each([
    ['a plain Table message', fromAna()],
    ['a mention at the Table', fromAna({ text: '@Bia, sua vez.' })],
    ['a whisper to Bia', fromAna({ channel: { kind: 'table', whisperTo: BIA } })],
    ['a plain direct', fromAna({ channel: direct })],
    ['a direct with a mention', fromAna({ channel: direct, text: '@bia oi' })],
    ['a plain group', fromAna({ channel: trioGroup() })],
  ])('%s is important exactly when the badge says so', (_situation, event) => {
    const conversations = receivedByBia(event);
    const received = conversations.find((each) => each.messages.length > 0);
    if (received === undefined) throw new Error(`no conversation took ${event.messageId}`);

    expect(isImportantConversation(received)).toBe(chatUnreadSummaryOf([received]).important);
  });

  it('a whisper to Bia is important and a plain direct is not', () => {
    const [whispered] = receivedByBia(fromAna({ channel: { kind: 'table', whisperTo: BIA } }));
    const plain = receivedByBia(fromAna({ channel: direct })).at(-1);

    expect(whispered && isImportantConversation(whispered)).toBe(true);
    expect(plain && isImportantConversation(plain)).toBe(false);
  });
});
