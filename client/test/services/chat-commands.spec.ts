import { beforeEach, describe, expect, it } from 'vitest';
import { RealtimeChatCommands, type ChatSendRequest } from '@/services/chat-commands';
import { VHARN } from '../support/campaigns-api-fake';
import { CHAT_MESSAGE_ID } from '../support/chat-fixtures';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { BIA_AT_TABLE } from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const EVENT = 'chat:send';
const WHISPER_TO_BIA: ChatSendRequest = {
  channel: { kind: 'table', whisperTo: BIA_AT_TABLE.userId },
  speaker: { kind: 'self' },
  text: 'Cuidado com o baú.',
};

function refusal(code: string, extra: object = {}) {
  return { ok: false, error: { code, message: `refused: ${code}`, ...extra } };
}

describe('RealtimeChatCommands', () => {
  let transport: RealtimeTransportFake;
  let chat: RealtimeChatCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    chat = new RealtimeChatCommands(transport, () => ACTION_ID);
  });

  it('"chat:send" goes out with a new action id, the table and the message as asked', () => {
    void chat.send(VHARN.id, WHISPER_TO_BIA);
    expect(transport.sent).toEqual([
      { event: EVENT, payload: { actionId: ACTION_ID, campaignId: VHARN.id, ...WHISPER_TO_BIA } },
    ]);
  });

  it('an ok ack answers ok with the id of the message', async () => {
    const result = chat.send(VHARN.id, WHISPER_TO_BIA);
    await transport.answerAck({ ok: true, messageId: CHAT_MESSAGE_ID }, EVENT);
    expect(await result).toEqual({ ok: true, messageId: CHAT_MESSAGE_ID });
  });

  it('RATE_LIMITED answers rate_limited with the seconds to wait', async () => {
    const result = chat.send(VHARN.id, WHISPER_TO_BIA);
    await transport.answerAck(refusal('RATE_LIMITED', { retryAfterSeconds: 4 }), EVENT);
    expect(await result).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 4 },
    });
  });

  it('RATE_LIMITED without the seconds waits 1 s', async () => {
    const result = chat.send(VHARN.id, WHISPER_TO_BIA);
    await transport.answerAck(refusal('RATE_LIMITED'), EVENT);
    expect(await result).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 1 },
    });
  });

  it.each([
    ['CAMPAIGN_NOT_FOUND', 'not_found'],
    ['FORBIDDEN', 'forbidden'],
    ['CHAT_RECIPIENT_NOT_MEMBER', 'recipient_not_member'],
    ['CHAT_SPEAKER_NOT_ALLOWED', 'speaker_not_allowed'],
    ['CHAT_RECIPIENT_IS_SENDER', 'recipient_is_sender'],
    ['CHAT_SENDER_NOT_IN_GROUP', 'sender_not_in_group'],
    ['SCENE_NOT_FOUND', 'speaker_not_found'],
    ['TOKEN_NOT_FOUND', 'speaker_not_found'],
    ['INVALID_BODY', 'invalid'],
    ['UNAUTHENTICATED', 'unauthenticated'],
    ['INTERNAL_ERROR', 'unexpected'],
  ])('a refusal with %s answers %s', async (code, kind) => {
    const result = chat.send(VHARN.id, WHISPER_TO_BIA);
    await transport.answerAck(refusal(code), EVENT);
    expect(await result).toEqual({ ok: false, failure: { kind } });
  });

  it('no ack in 5 s answers offline', async () => {
    const result = chat.send(VHARN.id, WHISPER_TO_BIA);
    await transport.timeOutAck(EVENT);
    expect(await result).toEqual({ ok: false, failure: { kind: 'offline' } });
  });

  it('an ack outside the DTO (no message id) answers unexpected', async () => {
    const result = chat.send(VHARN.id, WHISPER_TO_BIA);
    await transport.answerAck({ ok: true }, EVENT);
    expect(await result).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });
});
