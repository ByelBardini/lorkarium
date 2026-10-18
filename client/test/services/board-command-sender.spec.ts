import { beforeEach, describe, expect, it } from 'vitest';
import { BoardCommandSender } from '@/services/board-command-sender';
import { VHARN } from '../support/campaigns-api-fake';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const EVENT = 'token:moveMany';

describe('BoardCommandSender', () => {
  let transport: RealtimeTransportFake;
  let sender: BoardCommandSender;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    sender = new BoardCommandSender(transport, () => ACTION_ID);
  });

  it('a command goes out with a new action id, the table and its fields', () => {
    void sender.send(EVENT, VHARN.id, { moves: [] });
    expect(transport.sent).toEqual([
      { event: EVENT, payload: { actionId: ACTION_ID, campaignId: VHARN.id, moves: [] } },
    ]);
  });

  it('an ok ack answers ok with the new version', async () => {
    const result = sender.send(EVENT, VHARN.id, {});
    await transport.answerAck({ ok: true, version: 5 }, EVENT);
    expect(await result).toEqual({ ok: true, version: 5 });
  });

  it('an ok ack of a creating command answers the ids the server gave', async () => {
    const result = sender.send(EVENT, VHARN.id, {});
    const createdIds = ['5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a'];
    await transport.answerAck({ ok: true, version: 5, createdIds }, EVENT);
    expect(await result).toEqual({ ok: true, version: 5, createdIds });
  });

  it.each([
    ['FORBIDDEN', 'forbidden'],
    ['CAMPAIGN_NOT_FOUND', 'not_found'],
    ['STALE_UNDO', 'stale_undo'],
    ['RATE_LIMITED', 'rate_limited'],
    ['UNAUTHENTICATED', 'unauthenticated'],
    ['WHATEVER', 'unexpected'],
  ])('a refusal with %s is the %s failure', async (code, failure) => {
    const result = sender.send(EVENT, VHARN.id, {});
    await transport.answerAck({ ok: false, error: { code, message: 'x' } }, EVENT);
    expect(await result).toEqual({ ok: false, failure });
  });

  it('an ack that never arrives in 5 s is offline', async () => {
    const result = sender.send(EVENT, VHARN.id, {});
    await transport.timeOutAck(EVENT);
    expect(await result).toEqual({ ok: false, failure: 'offline' });
  });

  it('an ack outside the DTO is unexpected', async () => {
    const result = sender.send(EVENT, VHARN.id, {});
    await transport.answerAck({ ok: true }, EVENT);
    expect(await result).toEqual({ ok: false, failure: 'unexpected' });
  });
});
