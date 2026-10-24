import { beforeEach, describe, expect, it } from 'vitest';
import { BoardCommandSender } from '@/services/board-command-sender';
import { VHARN } from '../support/campaigns-api-fake';
import { VHARN_GRID } from '../support/table-session-fixtures';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const EVENT = 'token:moveMany';
const TORRE_ID = '8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b';

describe('BoardCommandSender', () => {
  let transport: RealtimeTransportFake;
  let sender: BoardCommandSender;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    sender = new BoardCommandSender(transport, () => ACTION_ID);
  });

  it('a command goes out with a new action id, the table, the grid of its scope and its fields', () => {
    void sender.send(EVENT, { campaignId: VHARN.id, sceneId: TORRE_ID }, { moves: [] });
    expect(transport.sent).toEqual([
      {
        event: EVENT,
        payload: { actionId: ACTION_ID, campaignId: VHARN.id, sceneId: TORRE_ID, moves: [] },
      },
    ]);
  });

  it('an ok ack answers ok with the new version', async () => {
    const result = sender.send(EVENT, VHARN_GRID, {});
    await transport.answerAck({ ok: true, version: 5 }, EVENT);
    expect(await result).toEqual({ ok: true, version: 5 });
  });

  it('an ok ack of a creating command answers the ids the server gave', async () => {
    const result = sender.send(EVENT, VHARN_GRID, {});
    const createdIds = ['5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a'];
    await transport.answerAck({ ok: true, version: 5, createdIds }, EVENT);
    expect(await result).toEqual({ ok: true, version: 5, createdIds });
  });

  it.each([
    ['TOKEN_LIMIT', 'token_limit'],
    ['FORBIDDEN', 'forbidden'],
    ['CAMPAIGN_NOT_FOUND', 'not_found'],
    ['SCENE_NOT_FOUND', 'scene_not_found'],
    ['STALE_UNDO', 'stale_undo'],
    ['RATE_LIMITED', 'rate_limited'],
    ['UNAUTHENTICATED', 'unauthenticated'],
    ['CONDITION_NAME_TAKEN', 'name_taken'],
    ['INVALID_STACKS', 'invalid_stacks'],
    ['WHATEVER', 'unexpected'],
  ])('a refusal with %s is the %s failure', async (code, failure) => {
    const result = sender.send(EVENT, VHARN_GRID, {});
    await transport.answerAck({ ok: false, error: { code, message: 'x' } }, EVENT);
    expect(await result).toEqual({ ok: false, failure });
  });

  it('an ack that never arrives in 5 s is offline', async () => {
    const result = sender.send(EVENT, VHARN_GRID, {});
    await transport.timeOutAck(EVENT);
    expect(await result).toEqual({ ok: false, failure: 'offline' });
  });

  it('an ack outside the DTO is unexpected', async () => {
    const result = sender.send(EVENT, VHARN_GRID, {});
    await transport.answerAck({ ok: true }, EVENT);
    expect(await result).toEqual({ ok: false, failure: 'unexpected' });
  });
});
