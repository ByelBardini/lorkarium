import { beforeEach, describe, expect, it } from 'vitest';
import { BoardCommandSender } from '@/services/board-command-sender';
import { RealtimeMainTokenCommands } from '@/services/main-token-commands';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { BIA_AT_TABLE, KAEL_ID, VHARN_GRID } from '../support/table-session-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';

describe('RealtimeMainTokenCommands', () => {
  let transport: RealtimeTransportFake;
  let commands: RealtimeMainTokenCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    commands = new RealtimeMainTokenCommands(new BoardCommandSender(transport, () => ACTION_ID));
  });

  it('setMainToken sends token:setMain with the tokenId and answers the version', async () => {
    const result = commands.setMainToken(VHARN_GRID, KAEL_ID);

    expect(transport.sent).toEqual([
      {
        event: 'token:setMain',
        payload: { actionId: ACTION_ID, ...VHARN_GRID, tokenId: KAEL_ID },
      },
    ]);
    await transport.answerAck({ ok: true, version: 9 }, 'token:setMain');
    expect(await result).toEqual({ ok: true, version: 9 });
  });

  it('the master choosing for Bia sends her id as playerId', () => {
    void commands.setMainToken(VHARN_GRID, KAEL_ID, BIA_AT_TABLE.userId);

    expect(transport.sent).toEqual([
      {
        event: 'token:setMain',
        payload: {
          actionId: ACTION_ID,
          ...VHARN_GRID,
          tokenId: KAEL_ID,
          playerId: BIA_AT_TABLE.userId,
        },
      },
    ]);
  });

  it.each([
    ['FORBIDDEN', 'forbidden'],
    ['TOKEN_NOT_FOUND', 'token_not_found'],
  ])('a refusal with %s is %s', async (code, failure) => {
    const result = commands.setMainToken(VHARN_GRID, KAEL_ID);
    await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'token:setMain');
    expect(await result).toEqual({ ok: false, failure });
  });

  it('token:setMain without an ack in 5 s is offline', async () => {
    const result = commands.setMainToken(VHARN_GRID, KAEL_ID);
    await transport.timeOutAck('token:setMain');
    expect(await result).toEqual({ ok: false, failure: 'offline' });
  });
});
