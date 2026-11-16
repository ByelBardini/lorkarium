import { describe, expect, it } from 'vitest';
import { callsViewer } from '@/lib/chat-conversations';
import { chatReplyOf, messagesByIdOf, repliesToViewer, replyWhisperToOf } from '@/lib/chat-replies';
import { ANA } from '../support/auth-api-fake';
import { CHAT_MESSAGE_ID, chatMessageIdOf, chatSent } from '../support/chat-fixtures';
import { BIA_AT_TABLE, CAIO_AT_TABLE } from '../support/table-session-fixtures';

const BIA = BIA_AT_TABLE.userId;
const CAIO = CAIO_AT_TABLE.userId;
const QUOTED = { messageId: chatMessageIdOf(9), mentionUserId: ANA.id };

describe('repliesToViewer', () => {
  it('calls the viewer named by the reply, and nobody else', () => {
    const reply = chatSent({ replyTo: QUOTED });

    expect(repliesToViewer(reply, ANA.id)).toBe(true);
    expect(repliesToViewer(reply, CAIO)).toBe(false);
    expect(repliesToViewer(reply, null)).toBe(false);
  });

  it('a reply with the @ off, or one the viewer wrote, calls nobody', () => {
    const silent = chatSent({ replyTo: { ...QUOTED, mentionUserId: null } });
    const ownReply = chatSent({ fromUserId: ANA.id, replyTo: QUOTED });

    expect(repliesToViewer(silent, ANA.id)).toBe(false);
    expect(repliesToViewer(ownReply, ANA.id)).toBe(false);
    expect(repliesToViewer(chatSent(), ANA.id)).toBe(false);
  });

  it('is part of the one rule of a call (the gold counter, the notice, the sound)', () => {
    const viewer = { userId: ANA.id, names: ['Ana', 'ana'] };

    expect(callsViewer(chatSent({ replyTo: QUOTED, text: 'Concordo.' }), viewer)).toBe(true);
    expect(callsViewer(chatSent({ text: 'Concordo.' }), viewer)).toBe(false);
  });
});

describe('replyWhisperToOf', () => {
  it('the open Table and the other channels answer to the whole Table', () => {
    expect(replyWhisperToOf(chatSent(), ANA.id)).toBeNull();
    const group = chatSent({
      channel: {
        kind: 'group',
        groupId: chatMessageIdOf(7),
        name: 'Os Três',
        memberIds: [ANA.id, BIA],
      },
    });
    expect(replyWhisperToOf(group, ANA.id)).toBeNull();
  });

  it('a whisper is answered in the same whisper, to whoever of the two is not the viewer', () => {
    const toAna = chatSent({ channel: { kind: 'table', whisperTo: ANA.id } });
    const fromAnaToCaio = chatSent({
      fromUserId: ANA.id,
      channel: { kind: 'table', whisperTo: CAIO },
    });

    expect(replyWhisperToOf(toAna, ANA.id)).toBe(BIA);
    expect(replyWhisperToOf(fromAnaToCaio, ANA.id)).toBe(CAIO);
  });
});

describe('chatReplyOf', () => {
  const message = { event: chatSent(), receivedAtMs: 0 };

  it('no draft is no reply', () => {
    expect(chatReplyOf(null, ANA.id)).toBeNull();
  });

  it('carries the quoted id and calls its author while the @ is on', () => {
    expect(chatReplyOf({ message, mention: true }, ANA.id)).toEqual({
      messageId: CHAT_MESSAGE_ID,
      mentionUserId: BIA,
    });
    expect(chatReplyOf({ message, mention: false }, ANA.id)).toEqual({
      messageId: CHAT_MESSAGE_ID,
      mentionUserId: null,
    });
  });

  it('answering oneself never calls oneself', () => {
    expect(chatReplyOf({ message, mention: true }, BIA)?.mentionUserId).toBeNull();
  });
});

describe('messagesByIdOf', () => {
  it('finds each message by its id', () => {
    const first = { event: chatSent({ messageId: chatMessageIdOf(1) }), receivedAtMs: 1 };
    const second = { event: chatSent({ messageId: chatMessageIdOf(2) }), receivedAtMs: 2 };
    const byId = messagesByIdOf([first, second]);

    expect(byId.get(chatMessageIdOf(2))).toBe(second);
    expect(byId.get(chatMessageIdOf(3))).toBeUndefined();
  });
});
