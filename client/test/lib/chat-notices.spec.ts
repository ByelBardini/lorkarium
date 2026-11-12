import type { ChatSentDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import type { ChatConversationKey } from '@/lib/chat-conversations';
import { chatNoticeOf, chatTitleOf, type ChatNoticeInput } from '@/lib/chat-notices';
import { ANA } from '../support/auth-api-fake';
import { chatSent, directBetween } from '../support/chat-fixtures';
import { BIA_AT_TABLE, CAIO_AT_TABLE } from '../support/table-session-fixtures';

const BIA = BIA_AT_TABLE.userId;
const CAIO = CAIO_AT_TABLE.userId;

function noticeFor(
  event: ChatSentDto,
  overrides: Partial<Omit<ChatNoticeInput, 'message'>> = {},
): ReturnType<typeof chatNoticeOf> {
  return chatNoticeOf({
    message: { event, receivedAtMs: 1000 },
    key: 'table',
    calls: false,
    viewerId: BIA,
    shownKey: null,
    ...overrides,
  });
}

describe('chatNoticeOf', () => {
  it('a line of Caio at the Table with the chat closed is a preview, not important', () => {
    const notice = noticeFor(chatSent({ fromUserId: CAIO, text: 'Vou abrir' }));
    expect(notice).toEqual({ preview: true, important: false });
  });

  it('a message that calls the viewer (a whisper or an @) is a preview and important', () => {
    const whisper = chatSent({ fromUserId: ANA.id, channel: { kind: 'table', whisperTo: BIA } });
    expect(noticeFor(whisper, { calls: true })).toEqual({ preview: true, important: true });
  });

  it('a direct to the viewer without a mention is a preview, not important', () => {
    const direct = chatSent({ fromUserId: CAIO, channel: directBetween(BIA, CAIO) });
    const key: ChatConversationKey = `direct:${CAIO}`;
    expect(noticeFor(direct, { key })).toEqual({ preview: true, important: false });
  });

  it('the viewer’s own message sets off nothing, even calling themselves', () => {
    const own = chatSent({ fromUserId: BIA, text: '@Bia lembrete' });
    expect(noticeFor(own, { calls: true })).toEqual({ preview: false, important: false });
  });

  it('a message of the conversation shown sets off nothing, even a whisper', () => {
    const whisper = chatSent({ fromUserId: ANA.id, channel: { kind: 'table', whisperTo: BIA } });
    const notice = noticeFor(whisper, { calls: true, shownKey: 'table' });
    expect(notice).toEqual({ preview: false, important: false });
  });

  it('a message of another conversation than the one shown still sets off its notice', () => {
    const direct = chatSent({ fromUserId: CAIO, channel: directBetween(BIA, CAIO) });
    const notice = noticeFor(direct, { key: `direct:${CAIO}`, calls: true, shownKey: 'table' });
    expect(notice).toEqual({ preview: true, important: true });
  });

  it('while the viewer is unknown, a message is someone else’s', () => {
    const notice = noticeFor(chatSent({ fromUserId: BIA }), { viewerId: null });
    expect(notice).toEqual({ preview: true, important: false });
  });
});

describe('chatTitleOf', () => {
  it.each([
    [{ count: 3, important: true }, '(3!) Lorkarium · Vharn'],
    [{ count: 2, important: false }, '(2) Lorkarium · Vharn'],
    [{ count: 0, important: false }, 'Lorkarium · Vharn'],
  ])('unread %o gives the tab title %s', (unread, title) => {
    expect(chatTitleOf('Vharn', unread)).toBe(title);
  });
});
