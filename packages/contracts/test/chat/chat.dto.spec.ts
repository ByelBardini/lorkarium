import { describe, expect, it } from 'vitest';
import {
  CHAT_GROUP_MEMBERS_MAX,
  CHAT_GROUP_NAME_MAX,
  CHAT_TEXT_MAX,
  chatSendAckDto,
  chatSendCommandDto,
  chatSentDto,
} from '../../src/chat/chat.dto';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const CAMPAIGN_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';
const MESSAGE_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const GROUP_ID = '7a6f5e4d-3c2b-4a1f-8e0d-9c8b7a6f5e4d';
const SCENE_ID = '8b7a6f5e-4d3c-4b2a-9f0e-1d2c3b4a5f6e';
const TOKEN_ID = '9c8b7a6f-5e4d-4c3b-8a2f-0e1d2c3b4a5f';
const ANA_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const BIA_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';
const AT = '2026-10-27T12:00:00.000Z';

const TABLE = { kind: 'table', whisperTo: null };
const SELF = { kind: 'self' };

function command(overrides: Record<string, unknown> = {}) {
  return {
    actionId: ACTION_ID,
    campaignId: CAMPAIGN_ID,
    channel: TABLE,
    speaker: SELF,
    text: 'Oi, mesa',
    ...overrides,
  };
}

function memberIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const tail = index.toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${tail}`;
  });
}

function group(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'group',
    groupId: GROUP_ID,
    name: 'Conselho',
    memberIds: [ANA_ID, BIA_ID],
    ...overrides,
  };
}

function sentEvent(overrides: Record<string, unknown> = {}) {
  return {
    campaignId: CAMPAIGN_ID,
    messageId: MESSAGE_ID,
    at: AT,
    fromUserId: ANA_ID,
    channel: TABLE,
    speaker: SELF,
    text: 'Oi, mesa',
    ...overrides,
  };
}

function issueOf(result: { success: boolean; error?: { issues: { message: string }[] } }): string {
  return result.error?.issues.map((issue) => issue.message).join(' | ') ?? '';
}

describe('chatSendCommandDto', () => {
  it('trims the text before checking it', () => {
    const parsed = chatSendCommandDto.parse(command({ text: '   bom dia  ' }));

    expect(parsed.text).toBe('bom dia');
  });

  it('refuses a text that is only spaces', () => {
    expect(chatSendCommandDto.safeParse(command({ text: '    ' })).success).toBe(false);
  });

  it(`accepts ${CHAT_TEXT_MAX} characters and refuses one more, citing the limit`, () => {
    expect(chatSendCommandDto.safeParse(command({ text: 'a'.repeat(CHAT_TEXT_MAX) })).success).toBe(
      true,
    );

    const tooLong = chatSendCommandDto.safeParse(command({ text: 'a'.repeat(CHAT_TEXT_MAX + 1) }));

    expect(tooLong.success).toBe(false);
    expect(issueOf(tooLong)).toContain(String(CHAT_TEXT_MAX));
  });

  it('refuses a forged userId (the sender comes from the connection)', () => {
    expect(chatSendCommandDto.safeParse(command({ userId: ANA_ID })).success).toBe(false);
  });

  it('accepts a table message with a null whisper and a whisper to one member', () => {
    expect(chatSendCommandDto.safeParse(command()).success).toBe(true);
    const whisper = command({ channel: { kind: 'table', whisperTo: BIA_ID } });

    expect(chatSendCommandDto.safeParse(whisper).success).toBe(true);
  });

  it('accepts a direct conversation with one person', () => {
    const direct = command({ channel: { kind: 'direct', userId: BIA_ID } });

    expect(chatSendCommandDto.safeParse(direct).success).toBe(true);
  });

  it('refuses a group of one member', () => {
    const lonely = command({ channel: group({ memberIds: [ANA_ID] }) });

    expect(chatSendCommandDto.safeParse(lonely).success).toBe(false);
  });

  it(`accepts ${CHAT_GROUP_MEMBERS_MAX} members and refuses ${CHAT_GROUP_MEMBERS_MAX + 1}`, () => {
    const full = command({ channel: group({ memberIds: memberIds(CHAT_GROUP_MEMBERS_MAX) }) });
    const crowded = command({
      channel: group({ memberIds: memberIds(CHAT_GROUP_MEMBERS_MAX + 1) }),
    });

    expect(chatSendCommandDto.safeParse(full).success).toBe(true);
    expect(chatSendCommandDto.safeParse(crowded).success).toBe(false);
  });

  it('refuses a repeated member, citing the id', () => {
    const repeated = chatSendCommandDto.safeParse(
      command({ channel: group({ memberIds: [ANA_ID, BIA_ID, ANA_ID] }) }),
    );

    expect(repeated.success).toBe(false);
    expect(issueOf(repeated)).toContain(ANA_ID);
  });

  it(`refuses a blank group name and one of ${CHAT_GROUP_NAME_MAX + 1} characters`, () => {
    const blank = command({ channel: group({ name: '   ' }) });
    const long = command({ channel: group({ name: 'g'.repeat(CHAT_GROUP_NAME_MAX + 1) }) });

    expect(chatSendCommandDto.safeParse(blank).success).toBe(false);
    expect(chatSendCommandDto.safeParse(long).success).toBe(false);
  });

  it('trims the group name', () => {
    const parsed = chatSendCommandDto.parse(command({ channel: group({ name: '  Conselho ' }) }));

    expect(parsed.channel).toMatchObject({ name: 'Conselho' });
  });

  it('accepts speaking as a token and refuses a token speaker without tokenId', () => {
    const asToken = command({ speaker: { kind: 'token', sceneId: SCENE_ID, tokenId: TOKEN_ID } });
    const noToken = command({ speaker: { kind: 'token', sceneId: SCENE_ID } });

    expect(chatSendCommandDto.safeParse(asToken).success).toBe(true);
    expect(chatSendCommandDto.safeParse(noToken).success).toBe(false);
  });

  it('refuses a token name sent by the client (the server reads it)', () => {
    const named = command({
      speaker: { kind: 'token', sceneId: SCENE_ID, tokenId: TOKEN_ID, name: 'Dragão' },
    });

    expect(chatSendCommandDto.safeParse(named).success).toBe(false);
  });
});

describe('chatSendAckDto', () => {
  it('reads a success with the messageId and a failure with the API error', () => {
    expect(chatSendAckDto.parse({ ok: true, messageId: MESSAGE_ID })).toEqual({
      ok: true,
      messageId: MESSAGE_ID,
    });
    const failure = { ok: false, error: { code: 'RATE_LIMITED', message: 'slow down' } };

    expect(chatSendAckDto.safeParse(failure).success).toBe(true);
  });
});

describe('chatSentDto', () => {
  it('reads a table message and a whisper', () => {
    expect(chatSentDto.safeParse(sentEvent()).success).toBe(true);
    const whisper = sentEvent({ channel: { kind: 'table', whisperTo: BIA_ID } });

    expect(chatSentDto.safeParse(whisper).success).toBe(true);
  });

  it('reads a direct message with both people in order', () => {
    const direct = sentEvent({ channel: { kind: 'direct', userIds: [ANA_ID, BIA_ID] } });

    expect(chatSentDto.safeParse(direct).success).toBe(true);
  });

  it('refuses a direct message out of order or to oneself', () => {
    const reversed = sentEvent({ channel: { kind: 'direct', userIds: [BIA_ID, ANA_ID] } });
    const self = sentEvent({ channel: { kind: 'direct', userIds: [ANA_ID, ANA_ID] } });

    expect(chatSentDto.safeParse(reversed).success).toBe(false);
    expect(chatSentDto.safeParse(self).success).toBe(false);
  });

  it('reads a group message', () => {
    expect(chatSentDto.safeParse(sentEvent({ channel: group() })).success).toBe(true);
  });

  it('reads a token speaker with the name the server read', () => {
    const asToken = sentEvent({
      speaker: { kind: 'token', sceneId: SCENE_ID, tokenId: TOKEN_ID, name: 'Lucas' },
    });

    expect(chatSentDto.safeParse(asToken).success).toBe(true);
  });

  it('refuses a token speaker without a name', () => {
    const unnamed = sentEvent({ speaker: { kind: 'token', sceneId: SCENE_ID, tokenId: TOKEN_ID } });

    expect(chatSentDto.safeParse(unnamed).success).toBe(false);
  });
});
