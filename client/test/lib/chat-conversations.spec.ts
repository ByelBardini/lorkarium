import { describe, expect, it } from 'vitest';
import {
  EMPTY_TABLE_CONVERSATION,
  chatUnreadSummaryOf,
  conversationKeyOf,
  conversationTargetOf,
  mentionsAny,
  stripOrderOf,
  withConversation,
  type ChatConversation,
} from '@/lib/chat-conversations';
import { ANA } from '../support/auth-api-fake';
import { TRIO_GROUP_ID, chatSent, directBetween, trioGroup } from '../support/chat-fixtures';
import { BIA_AT_TABLE, CAIO_AT_TABLE } from '../support/table-session-fixtures';

const BIA = BIA_AT_TABLE.userId;
const CAIO = CAIO_AT_TABLE.userId;
const TRIO = {
  kind: 'group',
  groupId: TRIO_GROUP_ID,
  name: 'Os Três',
  memberIds: [ANA.id, BIA, CAIO],
} as const;

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

  it('unread in a direct is important', () => {
    const table = conversationWith({ kind: 'table' }, 1000, { unread: 1 });
    const direct = conversationWith({ kind: 'direct', userId: BIA }, 2000, { unread: 2 });

    expect(chatUnreadSummaryOf([table, direct])).toEqual({ count: 3, important: true });
  });

  it('a mention at the Table is important', () => {
    const table = conversationWith({ kind: 'table' }, 1000, { unread: 1, mentioned: true });

    expect(chatUnreadSummaryOf([table])).toEqual({ count: 1, important: true });
  });
});
