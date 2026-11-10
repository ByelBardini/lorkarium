import { cell } from '@lorkarium/game-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { BoardCommandSender } from '@/services/board-command-sender';
import { RealtimeTokenPatrolCommands } from '@/services/token-patrol-commands';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { KAEL_ID, LYRA_ID, VHARN_GRID } from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const ROUTE = {
  path: [cell(4, 4), cell(8, 4), cell(8, 8)],
  repeat: 'loop',
  speed: 1,
  turns: true,
  gait: 'glide',
} as const;

describe('RealtimeTokenPatrolCommands', () => {
  let transport: RealtimeTransportFake;
  let commands: RealtimeTokenPatrolCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    commands = new RealtimeTokenPatrolCommands(new BoardCommandSender(transport, () => ACTION_ID));
  });

  it('setTokenPatrol sends token:setPatrol with the route as [col, row] pairs and answers the version', async () => {
    const result = commands.setTokenPatrol(VHARN_GRID, KAEL_ID, ROUTE);

    expect(transport.sent).toEqual([
      {
        event: 'token:setPatrol',
        payload: {
          actionId: ACTION_ID,
          ...VHARN_GRID,
          tokenId: KAEL_ID,
          patrol: {
            path: [
              [4, 4],
              [8, 4],
              [8, 8],
            ],
            repeat: 'loop',
            speed: 1,
            turns: true,
            gait: 'glide',
          },
        },
      },
    ]);
    await transport.answerAck({ ok: true, version: 9 }, 'token:setPatrol');
    expect(await result).toEqual({ ok: true, version: 9 });
  });

  it('setTokenPatrol with no route sends patrol null (takes it away)', () => {
    void commands.setTokenPatrol(VHARN_GRID, KAEL_ID, null);

    expect(transport.sent[0]?.payload).toMatchObject({ tokenId: KAEL_ID, patrol: null });
  });

  it('setTokenPatrolsActive sends token:setPatrolActiveMany with the ids and active', () => {
    void commands.setTokenPatrolsActive(VHARN_GRID, [KAEL_ID, LYRA_ID], true);

    expect(transport.sent).toEqual([
      {
        event: 'token:setPatrolActiveMany',
        payload: { actionId: ACTION_ID, ...VHARN_GRID, tokenIds: [KAEL_ID, LYRA_ID], active: true },
      },
    ]);
  });

  it.each([
    ['OUT_OF_SCENE', 'out_of_scene'],
    ['TOKEN_PATROL_NOT_FOUND', 'token_patrol_not_found'],
    ['TOKEN_PATROL_LIMIT', 'token_patrol_limit'],
    ['INVALID_TOKEN_PATROL', 'invalid_token_patrol'],
    ['TOKEN_NOT_FOUND', 'token_not_found'],
    ['FORBIDDEN', 'forbidden'],
  ])('a refusal with %s is %s', async (code, failure) => {
    const result = commands.setTokenPatrolsActive(VHARN_GRID, [KAEL_ID], true);
    await transport.answerAck(
      { ok: false, error: { code, message: 'x' } },
      'token:setPatrolActiveMany',
    );
    expect(await result).toEqual({ ok: false, failure });
  });

  it('an ack outside the DTO is unexpected', async () => {
    const result = commands.setTokenPatrol(VHARN_GRID, KAEL_ID, ROUTE);
    await transport.answerAck({ ok: 'yes' }, 'token:setPatrol');
    expect(await result).toEqual({ ok: false, failure: 'unexpected' });
  });

  it('token:setPatrol without an ack in 5 s is offline', async () => {
    const result = commands.setTokenPatrol(VHARN_GRID, KAEL_ID, ROUTE);
    await transport.timeOutAck('token:setPatrol');
    expect(await result).toEqual({ ok: false, failure: 'offline' });
  });
});
