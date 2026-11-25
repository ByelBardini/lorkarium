import { describe, expect, it } from 'vitest';
import {
  CUSTOM_EMOJIS_PER_MESSAGE_MAX,
  customEmojiCreateQueryDto,
  customEmojiNameDto,
  customEmojiRefsDto,
  customEmojiRenameDto,
} from '../../src/custom-emojis/custom-emoji.dto';
import { chatSentDto } from '../../src/chat/chat.dto';
import { dmSentDto } from '../../src/direct-messages/direct-message.dto';

const EMOJI_ID = '0b6f8a7e-7d43-4a5e-9a1c-1f6f0c9b2d11';
const USER_A = '1b6f8a7e-7d43-4a5e-9a1c-1f6f0c9b2d11';
const USER_B = '2b6f8a7e-7d43-4a5e-9a1c-1f6f0c9b2d11';

function refs(count: number) {
  return Array.from({ length: count }, (_, at) => ({ name: `e${at}x`, emojiId: EMOJI_ID }));
}

describe('customEmojiNameDto', () => {
  it('accepts lower-case letters, digits and underscores, from 2 to 32', () => {
    expect(customEmojiNameDto.parse('teste_1')).toBe('teste_1');
    expect(customEmojiNameDto.parse('ab')).toBe('ab');
    expect(customEmojiNameDto.parse('x'.repeat(32))).toBe('x'.repeat(32));
  });

  it('refuses a name too short, too long, with a space, a capital or an accent', () => {
    for (const name of ['a', 'x'.repeat(33), 'com espaco', 'Teste', 'ação', ':doge:']) {
      expect(customEmojiNameDto.safeParse(name).success).toBe(false);
    }
  });

  it('refuses a name of the catalog, saying why', () => {
    const result = customEmojiNameDto.safeParse('doge');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/catalog/u);
  });
});

describe('customEmojiCreateQueryDto and customEmojiRenameDto', () => {
  it('carry the name only', () => {
    expect(customEmojiCreateQueryDto.parse({ name: 'festa' })).toEqual({ name: 'festa' });
    expect(customEmojiRenameDto.safeParse({ name: 'festa', extra: 1 }).success).toBe(false);
  });
});

describe('customEmojiRefsDto', () => {
  it('takes up to 20 emojis of a message and refuses 21', () => {
    expect(CUSTOM_EMOJIS_PER_MESSAGE_MAX).toBe(20);
    expect(customEmojiRefsDto.safeParse(refs(20)).success).toBe(true);
    expect(customEmojiRefsDto.safeParse(refs(21)).success).toBe(false);
  });
});

describe('the emojis on the sent events', () => {
  const chat = {
    campaignId: USER_A,
    messageId: EMOJI_ID,
    at: '2026-11-24T12:00:00.000Z',
    fromUserId: USER_A,
    channel: { kind: 'table', whisperTo: null },
    speaker: { kind: 'self' },
    text: 'oi :festa:',
  };
  const dm = {
    messageId: EMOJI_ID,
    fromUserId: USER_A,
    toUserId: USER_B,
    text: 'oi :festa:',
    at: '2026-11-24T12:00:00.000Z',
  };

  it('chat:sent and dm:sent carry them, an old history without them reads as none', () => {
    const festa = [{ name: 'festa', emojiId: EMOJI_ID }];
    expect(chatSentDto.parse({ ...chat, customEmojis: festa }).customEmojis).toEqual(festa);
    expect(chatSentDto.parse(chat).customEmojis).toEqual([]);
    expect(dmSentDto.parse({ ...dm, customEmojis: festa }).customEmojis).toEqual(festa);
    expect(dmSentDto.parse(dm).customEmojis).toEqual([]);
  });

  it('refuses 21 emojis on one message', () => {
    expect(chatSentDto.safeParse({ ...chat, customEmojis: refs(21) }).success).toBe(false);
    expect(dmSentDto.safeParse({ ...dm, customEmojis: refs(21) }).success).toBe(false);
  });
});
