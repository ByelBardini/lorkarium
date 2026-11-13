import { beforeEach, describe, expect, it } from 'vitest';
import { RealtimeDirectMessageCommands } from '@/services/direct-message-commands';
import { BIA } from '../support/friends-fixtures';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const MESSAGE_ID = '4e5f6071-8293-4aa4-8bb5-d6e7f8091a2b';

describe('RealtimeDirectMessageCommands', () => {
  let transport: RealtimeTransportFake;
  let commands: RealtimeDirectMessageCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    commands = new RealtimeDirectMessageCommands(transport, () => ACTION_ID);
  });

  it('send emits dm:send with a new action id and answers the message id', async () => {
    const pending = commands.send(BIA.userId, 'oi');
    await transport.answerAck({ ok: true, messageId: MESSAGE_ID }, 'dm:send');
    expect(await pending).toEqual({ ok: true, messageId: MESSAGE_ID });
    expect(transport.sent).toEqual([
      { event: 'dm:send', payload: { actionId: ACTION_ID, toUserId: BIA.userId, text: 'oi' } },
    ]);
  });

  it.each([
    ['DM_NOT_FRIENDS', { kind: 'not_friends' }],
    ['DM_RECIPIENT_OFFLINE', { kind: 'recipient_offline' }],
    ['DM_SENDER_INVISIBLE', { kind: 'sender_invisible' }],
    ['INVALID_BODY', { kind: 'invalid' }],
    ['UNAUTHENTICATED', { kind: 'unauthenticated' }],
    ['SOMETHING_NEW', { kind: 'unexpected' }],
  ])('a refusal %s fails as %o', async (code, failure) => {
    const pending = commands.send(BIA.userId, 'oi');
    await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'dm:send');
    expect(await pending).toEqual({ ok: false, failure });
  });

  it('RATE_LIMITED carries the seconds to wait (1 when the server says none)', async () => {
    const first = commands.send(BIA.userId, 'oi');
    await transport.answerAck(
      { ok: false, error: { code: 'RATE_LIMITED', message: 'x', retryAfterSeconds: 3 } },
      'dm:send',
    );
    const second = commands.send(BIA.userId, 'oi');
    await transport.answerAck(
      { ok: false, error: { code: 'RATE_LIMITED', message: 'x' } },
      'dm:send',
    );
    expect(await first).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 3 },
    });
    expect(await second).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 1 },
    });
  });

  it('an ack outside the DTO is unexpected', async () => {
    const pending = commands.send(BIA.userId, 'oi');
    await transport.answerAck({ ok: true }, 'dm:send');
    expect(await pending).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('no ack in time is offline', async () => {
    const pending = commands.send(BIA.userId, 'oi');
    await transport.timeOutAck('dm:send');
    expect(await pending).toEqual({ ok: false, failure: { kind: 'offline' } });
  });

  it('typing emits dm:typing to the friend while connected, and nothing while not', () => {
    commands.typing(BIA.userId);
    transport.lifecycle({ kind: 'connected' });
    commands.typing(BIA.userId);
    expect(transport.sent).toEqual([{ event: 'dm:typing', payload: { toUserId: BIA.userId } }]);
  });
});
